// A deliberately limited reader, not a JavaScript evaluator. Only constant
// strings, booleans, and arrays of strings may back the requested exports.
const identifier = /^[A-Za-z_$][\w$]*$/;
const regexPrefix = new Set(['(', '[', '{', '=', ':', ',', ';', '!', '?', '&', '|', '=>', 'return', 'throw', 'case', 'typeof', 'void', 'delete']);

function quoted(source, start) {
    const quote = source[start];
    let value = '', valid = true, i = start + 1;
    for (; i < source.length; i++) {
        const c = source[i];
        if (c === quote) return {value, valid, end: i + 1};
        if (c !== '\\') { value += c; if (c === '\n' || c === '\r') valid = false; continue; }
        const escape = source[++i];
        const simple = {n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0'};
        if (escape === '\n') continue;
        if (escape === '\r') { if (source[i + 1] === '\n') i++; continue; }
        if (escape === 'x' || escape === 'u') {
            const braced = escape === 'u' && source[i + 1] === '{';
            const first = i + (braced ? 2 : 1);
            const end = braced ? source.indexOf('}', first) : first + (escape === 'x' ? 2 : 4);
            const digits = source.slice(first, end);
            if (end < first) return {value, valid: false, end: source.length};
            if (!/^[\da-f]+$/i.test(digits) || Number.parseInt(digits, 16) > 0x10ffff) valid = false;
            else value += String.fromCodePoint(Number.parseInt(digits, 16));
            i = braced ? end : end - 1;
        } else if (escape === '0' && /\d/.test(source[i + 1] || '')) valid = false;
        else if (escape in simple) value += simple[escape];
        else if (escape && !/[1-9]/.test(escape)) value += escape;
        else valid = false;
    }
    return {value, valid: false, end: i};
}

function skipRegex(source, start) {
    let inClass = false, i = start + 1;
    for (; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '[') inClass = true;
        if (source[i] === ']') inClass = false;
        if (source[i] === '/' && !inClass) {
            while (/[a-z]/i.test(source[i + 1] || '')) i++;
            return i + 1;
        }
        if (source[i] === '\n') break;
    }
    return i;
}

function skipTemplate(source, start) {
    let i = start + 1;
    while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '`') return i + 1;
        if (source[i] === '$' && source[i + 1] === '{') {
            const expression = lex(source, i + 2, true);
            i = expression.end;
        } else i++;
    }
    return i;
}

function lex(source, start = 0, interpolation = false) {
    const tokens = [];
    let i = start, depth = 0;
    while (i < source.length) {
        const c = source[i];
        if (/\s/.test(c)) { i++; continue; }
        if (source.startsWith('//', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue; }
        if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; continue; }
        let token;
        if (c === '"' || c === "'") {
            const string = quoted(source, i);
            token = {kind: 'string', value: string.value, valid: string.valid}; i = string.end;
        } else if (c === '`') { i = skipTemplate(source, i); token = {kind: 'opaque', value: 'template'}; }
        else if (c === '/' && (!tokens.length || regexPrefix.has(tokens.at(-1).value))) {
            i = skipRegex(source, i); token = {kind: 'opaque', value: 'regex'};
        } else if (/[A-Za-z_$]/.test(c)) {
            const first = i++;
            while (/[\w$]/.test(source[i] || '')) i++;
            token = {kind: 'identifier', value: source.slice(first, i)};
        } else {
            token = {kind: 'punctuation', value: source.startsWith('=>', i) ? '=>' : c};
            i += token.value.length;
        }
        if (interpolation && token.kind === 'punctuation' && token.value === '}' && depth === 0) return {tokens, end: i};
        if (token.value === '{' && token.kind === 'punctuation') depth++;
        if (token.value === '}' && token.kind === 'punctuation') depth--;
        tokens.push(token);
    }
    return {tokens, end: i};
}

function literal(tokens, start) {
    const token = tokens[start];
    if (token?.kind === 'string' && token.valid) return {value: token.value, end: start + 1};
    if (token?.kind === 'identifier' && ['true', 'false'].includes(token.value)) return {value: token.value === 'true', end: start + 1};
    if (token?.kind !== 'punctuation' || token.value !== '[') return null;
    const value = [];
    let i = start + 1;
    while (!(tokens[i]?.kind === 'punctuation' && tokens[i].value === ']')) {
        if (tokens[i]?.kind !== 'string' || !tokens[i].valid) return null;
        value.push(tokens[i++].value);
        if (tokens[i]?.kind === 'punctuation' && tokens[i].value === ']') break;
        if (tokens[i++]?.value !== ',') return null;
    }
    return tokens[i]?.value === ']' ? {value, end: i + 1} : null;
}

function getter(tokens, start) {
    let i = start;
    if (tokens[i++]?.value !== '(' || tokens[i++]?.value !== ')' || tokens[i++]?.value !== '=>') return null;
    if (tokens[i]?.kind === 'identifier' && identifier.test(tokens[i].value) && [',', '}'].includes(tokens[i + 1]?.value)) return tokens[i].value;
    if (tokens[i++]?.value !== '{' || tokens[i++]?.value !== 'return') return null;
    const name = tokens[i++];
    if (tokens[i]?.value === ';') i++;
    return name?.kind === 'identifier' && tokens[i]?.value === '}' ? name.value : null;
}

export function readBundleExports(text, names) {
    const wanted = new Set(names), found = new Map();
    // HTML and raw JS are both accepted. Never scan markup as JavaScript.
    const scripts = /^\s*</.test(text) ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]) : [];
    for (const source of scripts.length ? scripts : [text]) {
        const {tokens} = lex(source);
        const root = new Map(), scopes = [root];
        const brackets = [];
        for (const [index, token] of tokens.entries()) {
            token.scope = scopes.at(-1);
            if (token.kind !== 'punctuation') continue;
            if (['(', '[', '{'].includes(token.value)) brackets.push(index);
            if ([')', ']', '}'].includes(token.value)) {
                const opening = brackets.pop();
                if (opening !== undefined) tokens[opening].close = index;
            }
            if (token.value === '{') { token.child = new Map(); scopes.push(token.child); }
            if (token.value === '}' && scopes.length > 1) scopes.pop();
        }
        // Resolve after scanning declarations, so export/definition order is irrelevant.
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].kind !== 'identifier' || tokens[i].value !== 'const') continue;
            const scope = tokens[i].scope;
            let j = i + 1;
            while (tokens[j]?.kind === 'identifier' && tokens[j + 1]?.value === '=') {
                const name = tokens[j].value, result = literal(tokens, j + 2);
                let end = j + 2;
                while (end < tokens.length) {
                    const token = tokens[end];
                    if (token.scope === scope && token.kind === 'punctuation' && [';', ',', '}'].includes(token.value)) break;
                    end = token.close !== undefined ? token.close + 1 : end + 1;
                }
                const valid = result && result.end === end;
                scope.set(name, scope.has(name) ? null : valid ? result.value : null);
                if (tokens[end]?.value !== ',') break;
                j = end + 1;
            }
        }
        const record = (name, binding, scope) => {
            if (!wanted.has(name)) return;
            const value = binding ? scope.get(binding) : undefined;
            if (value == null) throw new Error(`Unable to resolve bundle export ${name}: expected a constant literal in the same module`);
            if (found.has(name) && JSON.stringify(found.get(name)) !== JSON.stringify(value)) throw new Error(`Ambiguous bundle export ${name}`);
            found.set(name, value);
        };
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].kind !== 'identifier') continue;
            const method = tokens[i].value === 'Object' && tokens[i + 1]?.value === '.' ? tokens[i + 2]?.value : null;
            // The game also uses a minified helper: helper(exports,{NAME:()=>x}).
            const call = ['defineProperties', 'defineProperty'].includes(method) ? i + 3 : i + 1;
            if (tokens[call]?.value !== '(' || tokens[call + 1]?.kind !== 'identifier' || tokens[call + 2]?.value !== ',') continue;
            let j = call + 3;
            if (method === 'defineProperty') {
                const name = tokens[j++];
                if (name?.kind !== 'string' || !wanted.has(name.value) || tokens[j++]?.value !== ',') continue;
                const object = tokens[j++];
                if (object?.value !== '{' || !object.child) continue;
                for (; j < tokens.length && tokens[j].scope !== object.scope; j++) {
                    if (tokens[j].scope === object.child && tokens[j].value === 'get' && tokens[j + 1]?.value === ':') record(name.value, getter(tokens, j + 2), tokens[i].scope);
                }
            } else {
                const object = tokens[j++];
                if (object?.value !== '{' || !object.child) continue;
                for (; j < tokens.length && tokens[j].scope !== object.scope; j++) {
                    const key = tokens[j];
                    if (key.scope === object.child && ['identifier', 'string'].includes(key.kind) && wanted.has(key.value) && tokens[j + 1]?.value === ':') record(key.value, getter(tokens, j + 2), tokens[i].scope);
                }
            }
        }
    }
    for (const name of wanted) if (!found.has(name)) throw new Error(`Missing bundle export ${name}`);
    return Object.fromEntries(found);
}
