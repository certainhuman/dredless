import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {readBundleExports} from '../src/network/bundle-metadata.js';
import {fetchGameVersion, fetchServers} from '../src/network/servers.js';

const keys = ['LOCAL_DOMAIN', 'BASE_DOMAIN', 'TEST_DOMAIN', 'TEST_GAME_DOMAIN', 'GAME_DOMAINS', 'GAME_SERVER_NAMES', 'MASTER_DOMAIN', 'TEST_MASTER_DOMAIN', 'GAME_VERSION'];
const fixture = (mode) => readFile(new URL(`./fixtures/bundle-metadata/${mode}.js.txt`, import.meta.url), 'utf8');

test('production and test metadata excerpts resolve their named exports', async () => {
    for (const mode of ['prod', 'test']) {
        const values = readBundleExports(await fixture(mode), keys);
        assert.equal(values.LOCAL_DOMAIN, 'local.drednot.io');
        assert.equal(values.TEST_DOMAIN, 'test.drednot.io');
        assert.equal(values.TEST_GAME_DOMAIN, 't0.drednot.io');
        assert.deepEqual(values.GAME_DOMAINS, ['c0.drednot.io', 'c1.drednot.io']);
        assert.deepEqual(values.GAME_SERVER_NAMES, ['Persistent (US East)', 'Ephemeral (US East)']);
        assert.match(values.GAME_VERSION, /2026 \/ [a-f0-9]+$/);
    }
});

test('getter resolution tolerates reordered declarations, changed identifiers, whitespace and comments', () => {
    const source = `function module(exports) {
        const unused = something(() => { return ','; }), renamed = 'after', before = true;
        helper(exports, { /* config */ NAME : ( ) => renamed, FLAG: () => { return before; } });
        Object.defineProperty(exports, 'GAME_VERSION', { get : () => version });
        const version = 'different version';
    }`;
    assert.deepEqual(readBundleExports(source, ['NAME', 'FLAG', 'GAME_VERSION']), {NAME: 'after', FLAG: true, GAME_VERSION: 'different version'});
});

test('quoted strings and string arrays decode escapes, punctuation, Unicode and trailing commas', () => {
    const source = String.raw`const name='Ship \'name\' \x26 \u263a \u{1f680}', list=[']', '}', 'a,b', 'a\\b', '\n',];
        helper(exports, {'NAME':()=>name, LIST:()=>list});`;
    assert.deepEqual(readBundleExports(source, ['NAME', 'LIST']), {NAME: "Ship 'name' & ☺ 🚀", LIST: [']', '}', 'a,b', 'a\\b', '\n']});
});

test('comments, quoted decoys, regexes and nested templates cannot introduce fake exports', () => {
    const source = 'const name="real"; const decoy="<script>helper(exports,{NAME:()=>fake})</script>";' +
        '// helper(exports,{NAME:()=>bad});\n' +
        'const pattern=/[{}]/g; const template=`fake ${`nested ${"}"}`} helper(exports,{NAME:()=>bad})`;' +
        'helper(exports,{NAME:()=>name});';
    assert.deepEqual(readBundleExports(source, ['NAME']), {NAME: 'real'});
    assert.deepEqual(readBundleExports('<html><script>const name="html";helper(exports,{NAME:()=>name});</script></html>', ['NAME']), {NAME: 'html'});
});

test('reused minified bindings in other modules cannot satisfy an export', () => {
    assert.deepEqual(readBundleExports(`function first(exports){const e='wrong';}
        function second(exports){helper(exports,{NAME:()=>e});const e='right';}`, ['NAME']), {NAME: 'right'});
    assert.throws(() => readBundleExports(`const e='outside';function module(exports){helper(exports,{NAME:()=>e});}`, ['NAME']), /NAME.*same module/);
});

test('missing exports, conflicting exports and executable initializers fail explicitly without execution', () => {
    assert.throws(() => readBundleExports('const x="unexported";', ['NAME']), /Missing bundle export NAME/);
    assert.throws(() => readBundleExports(`function one(exports){const e='one';helper(exports,{NAME:()=>e});}
        function two(exports){const e='two';helper(exports,{NAME:()=>e});}`, ['NAME']), /Ambiguous bundle export NAME/);
    globalThis.metadataExecuted = false;
    for (const value of ['(globalThis.metadataExecuted=true)', '"prefix" + run()', '`template`', '["one",run()]']) {
        assert.throws(() => readBundleExports(`const e=${value};helper(exports,{NAME:()=>e});`, ['NAME']), /NAME.*constant literal/);
    }
    assert.equal(globalThis.metadataExecuted, false);
    delete globalThis.metadataExecuted;
});

test('public discovery selects the right hosts and retries after invalid or unavailable metadata', async () => {
    const original = globalThis.fetch;
    const production = await fixture('prod'), testing = await fixture('test');
    let responses = 0;
    try {
        globalThis.fetch = async (url) => {
            if (url.includes('retry-metadata.invalid')) {
                if (++responses === 1) return new Response('Unavailable', {status: 503});
                if (responses === 2) return new Response('helper(exports,{GAME_DOMAINS:()=>missing});');
                return new Response(production);
            }
            return new Response(url.includes('test.drednot.io') ? testing : production);
        };
        assert.deepEqual(await fetchServers('https://test.drednot.io'), [{index: 0, domain: 't0.drednot.io', description: 'Public Test'}]);
        assert.equal((await fetchServers('https://drednot.io'))[0].description, 'Persistent (US East)');
        assert.equal((await fetchServers('https://local.drednot.io'))[0].description, 'Local Test 1');
        assert.match(await fetchGameVersion('https://test.drednot.io'), /Nov 5/);
        await assert.rejects(fetchServers('https://retry-metadata.invalid'), /503/);
        await assert.rejects(fetchServers('https://retry-metadata.invalid'), /GAME_DOMAINS/);
        assert.equal((await fetchServers('https://retry-metadata.invalid')).length, 2);
    } finally { globalThis.fetch = original; }
});

test('invalid hostname, array shape and version values identify the offending export', async () => {
    const original = globalThis.fetch, source = await fixture('test');
    try {
        const cases = [
            ['"t0.drednot.io"', '"https://bad.example/path"', 'TEST_GAME_DOMAIN'],
            ['["c0.drednot.io","c1.drednot.io"]', 'true', 'GAME_DOMAINS'],
            ['["Persistent (US East)","Ephemeral (US East)"]', '["Only one"]', 'GAME_SERVER_NAMES']
        ];
        for (const [before, after, name] of cases) {
            globalThis.fetch = async () => new Response(source.replace(before, after));
            await assert.rejects(fetchServers(`https://${name.toLowerCase().replaceAll('_', '-')}.invalid`), new RegExp(`Invalid bundle export ${name}`));
        }
        globalThis.fetch = async () => new Response('const v=true;Object.defineProperty(exports,"GAME_VERSION",{get:()=>v});');
        await assert.rejects(fetchGameVersion('https://invalid-version.invalid'), /Invalid bundle export GAME_VERSION/);
    } finally { globalThis.fetch = original; }
});
