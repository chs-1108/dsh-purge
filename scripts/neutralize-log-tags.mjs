// 一次性维护脚本：把 lib/ 下 console.warn/log 里的插件名前缀换成中性标记。
// 用法：node scripts/neutralize-log-tags.mjs [--dry]
// 只改字符串字面量里的 "[dsh-purge] " / `[dsh-purge] `，不动注释、不动 marker 表。
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dry = process.argv.includes("--dry");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const libDir = path.join(root, "lib");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = statSync(fp);
    if (st.isDirectory()) walk(fp, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(fp);
  }
  return out;
}

let total = 0;
for (const fp of walk(libDir)) {
  const text = readFileSync(fp, "utf8");
  // 只处理出现在 console.* 调用实参里的前缀：先按行筛选，再在行内替换。
  const lines = text.split("\n");
  let changed = 0;
  const next = lines.map((line) => {
    if (!/console\.(warn|log|error|info|debug)/.test(line)) return line;
    if (!line.includes("[dsh-purge]")) return line;
    const out = line
      .split('"[dsh-purge] ').join('"[cfg] ')
      .split("`[dsh-purge] ").join("`[cfg] ")
      .split("'[dsh-purge] ").join("'[cfg] ");
    if (out !== line) changed += 1;
    return out;
  });
  if (changed === 0) continue;
  total += changed;
  console.log(`${dry ? "would change" : "changed"} ${changed} line(s): ${path.relative(root, fp)}`);
  if (!dry) writeFileSync(fp, next.join("\n"), "utf8");
}
console.log(dry ? `dry run: ${total} line(s)` : `done: ${total} line(s)`);
