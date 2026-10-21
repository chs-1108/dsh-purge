// 直接把当前插件版本应用到宿主（只写文件，不 swap asar、不杀进程）。
// 用法：node scripts/apply-now.mjs
//
// 用途：开发副本改了 patch 表后，不必等重启 —— 先把宿主文件洗到最新，
// 之后重启 dsh 就能带着新补丁起来。官方 app.asar 仍在时，引擎级补丁要等
// 重启流程把归档挪走才真正生效；本脚本刻意不碰归档。
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const core = await import(pathToFileURL(path.join(root, "lib", "core.js")).href);

core.applyRuntimeEnv();
const aiBase = core.findAiBase();
if (!aiBase) {
  console.error("找不到宿主 aiBase");
  process.exit(1);
}
console.log(`aiBase = ${aiBase}`);

const before = await core.patchStatus(aiBase);
const pendingBefore = Object.entries(before).filter(([, s]) => s === "pending").map(([id]) => id);
console.log(`应用前 pending: ${pendingBefore.length ? pendingBefore.join(", ") : "无"}`);

const report = await core.applyPatches(aiBase, core.ALL_PATCHES, { preserveClientBundles: false });
const summary = core.summarizeApplyReport(report);
console.log(`applied=${summary.applied} already=${summary.already} soft=${summary.soft.length} failed=${summary.failed.length}`);
for (const row of summary.failed) console.log(`  FAIL #${row.patch_id} ${row.name} → ${row.status}`);

const after = await core.patchStatus(aiBase);
const pendingAfter = Object.entries(after).filter(([, s]) => s === "pending").map(([id]) => id);
console.log(`应用后 pending: ${pendingAfter.length ? pendingAfter.join(", ") : "无"}`);

const shims = await core.patchAllShims();
console.log(`shim: ${Object.keys(shims).length} 个目录`);

// bin.js 的控制台隐藏注入（sidecar 文件名 / import 行）也在这里收敛。
try {
  const flash = core.silenceCmdFlash(aiBase);
  console.log(`phase-1 / console: ${JSON.stringify(flash)}`);
} catch (e) {
  console.log(`phase-1 / console: 跳过（${e && e.message ? e.message : e}）`);
}

console.log("");
console.log("宿主文件已更新。重启 dsh 后新补丁生效（官方 app.asar 仍在时，引擎级补丁要等重启把归档挪走）。");
process.exitCode = summary.failed.length === 0 && pendingAfter.length === 0 ? 0 : 1;
