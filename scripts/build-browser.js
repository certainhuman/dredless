import {build} from "esbuild";

await build({
    entryPoints: ["src/browser-global.js"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: "dist/browser/dredless.global.js",
    sourcemap: true
});
