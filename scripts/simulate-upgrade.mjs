// 升级演练（只读，不写宿主文件）。
// 用法：node scripts/simulate-upgrade.mjs
// 作用：在内存里对每个目标文件跑一遍全表替换，报告
//   1) 哪些文件会变；
//   2) 旧标记 [dsh-purge] 是否全部迁移成 [cfg]；
//   3) 再跑第二遍是否还有变化（幂等）。
import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const core = await import(pathToFileURL(path.join(root, "lib", "core.js")).href);

const aiBase = core.findAiBase();
if (!aiBase) {
  console.error("找不到宿主 aiBase");
  process.exit(1);
}

const files = core.targetFiles(aiBase);
const seen = new Set();
const rows = [];
let legacyLeft = 0;

function targetsOf(key) {
  const v = files[key];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

for (const patch of core.ALL_PATCHES) {
  if (!core.patchAppliesHere(patch)) continue;
  const keys = Array.isArray(patch.file) ? patch.file : [patch.file];
  for (const key of keys) {
    for (const fp of targetsOf(key)) {
      if (!fp || !existsSync(fp)) continue;
      const id = `${fp}::${patch.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      let text;
      try { text = readFileSync(fp, "utf8"); } catch { continue; }
      const first = core.applyReplacementsToText(text, patch, fp);
      if (!first.changed) continue;
      const second = core.applyReplacementsToText(first.text, patch, fp);
      const legacy = (first.text.match(/\[dsh-purge\]/g) || []).length;
      if (legacy > 0) legacyLeft += legacy;
      rows.push({
        file: path.relative(aiBase, fp),
        patch: `#${patch.id} ${patch.name}`,
        bytes: first.text.length - text.length,
        idempotent: !second.changed,
        legacy,
      });
    }
  }
}

console.log(`aiBase = ${aiBase}`);
console.log(`会变化的文件操作: ${rows.length}`);
for (const r of rows) {
  const flag = r.idempotent ? "幂等" : "非幂等!";
  console.log(`  ${r.patch.padEnd(42)} ${r.file}  Δ=${r.bytes}  ${flag}  legacy=${r.legacy}`);
}
console.log("");
console.log(`残留旧标记总数: ${legacyLeft}`);
const bad = rows.filter((r) => !r.idempotent);
console.log(bad.length ? `非幂等 ${bad.length} 项` : "全部幂等");
process.exitCode = bad.length === 0 && legacyLeft === 0 ? 0 : 1;
