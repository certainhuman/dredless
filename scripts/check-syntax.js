import {readdirSync} from "node:fs";
import {join} from "node:path";
import {execFileSync} from "node:child_process";

function javascriptFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...javascriptFiles(path));
        else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
    }
    return files;
}

const files = ["src/index.js", ...javascriptFiles("src")];
for (const file of new Set(files)) {
    execFileSync(process.execPath, ["--check", file], {stdio: "inherit"});
}
