import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "tools", "ws-observer-extension");
const dist = join(source, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of ["manifest.json", "content.js", "prehook.js", "page.js", "panel.css", "README.md"]) {
  await cp(join(source, file), join(dist, file));
}

await cp(join(root, "src"), join(dist, "dredless"), { recursive: true });

console.log(`Built websocket observer extension: ${dist}`);
