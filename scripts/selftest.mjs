// 本地自检：只读，不改宿主文件。
// 用法：node scripts/selftest.mjs
// 作用：检查 patch 表结构完整性 + 每个 patch 在当前宿主上的真实结算状态。
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const core = await import(pathToFileURL(path.join(root, "lib", "core.js")).href);

const problems = [];
const note = (msg) => problems.push(msg);

const patches = core.ALL_PATCHES;
console.log(`ALL_PATCHES = ${patches.length}`);

// 1) 结构完整性
const ids = new Map();
const names = new Map();
for (const p of patches) {
  if (p.id === undefined) note(`patch 缺 id: ${p.name || JSON.stringify(p).slice(0, 60)}`);
  if (ids.has(p.id)) note(`id 重复: #${p.id} (${ids.get(p.id)} / ${p.name})`);
  ids.set(p.id, p.name);
  if (!p.name) note(`patch #${p.id} 缺 name`);
  if (names.has(p.name)) note(`name 重复: ${p.name} (#${names.get(p.name)} / #${p.id})`);
  names.set(p.name, p.id);
  const hasRepl = Array.isArray(p.replacements) && p.replacements.length > 0;
  const hasPat = Array.isArray(p.patterns) && p.patterns.length > 0;
  const hasPat1 = typeof p.pattern === "string" || p.pattern instanceof RegExp;
  if (!hasRepl && !hasPat && !hasPat1) note(`patch #${p.id} ${p.name} 没有任何 pattern/replacements`);
  if (hasRepl) {
    for (const [i, r] of p.replacements.entries()) {
      if (r.pattern === undefined) note(`patch #${p.id} ${p.name} replacements[${i}] 缺 pattern`);
      if (r.replace === undefined) note(`patch #${p.id} ${p.name} replacements[${i}] 缺 replace`);
    }
  }
  if (p.skipIfMarked && !(p.markers?.length || p.marker)) {
    note(`patch #${p.id} ${p.name} skipIfMarked 但无 markers → 永远重复应用`);
  }
}

// 2) 真实结算状态
const aiBase = core.findAiBase();
console.log(`aiBase = ${aiBase}`);
if (!aiBase) {
  note("findAiBase() 返回空，所有文件级补丁都无从结算");
} else {
  const status = await core.patchStatus(aiBase, patches);
  const buckets = {};
  for (const p of patches) {
    const st = status[p.id] || "unknown";
    buckets[st] = (buckets[st] || 0) + 1;
    if (st === "pending" || st === "unmatched" || st === "missing_file") {
      note(`#${p.id} ${p.name} → ${st}`);
    }
  }
  console.log("状态分布:", JSON.stringify(buckets));
}

// 3) 报告
console.log("");
if (problems.length === 0) {
  console.log("自检通过：无结构问题，无 pending/unmatched/missing。");
} else {
  console.log(`自检发现 ${problems.length} 项：`);
  for (const p of problems) console.log(`  - ${p}`);
}
process.exitCode = problems.length === 0 ? 0 : 1;
