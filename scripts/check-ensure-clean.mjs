// 复现「点应用」写盘那一步：core.applyPatchesAllHosts()。
// 独立进程里 findAiBase() 拿不到桌面宿主（detectSurface 认的是 node.exe），
// 所以这里直接走 enumeratePatchAiBases（认 DSH_BASE），再核对标记。
// 不重启，只写盘；重启仍由面板按钮触发。
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN = process.env.DSH_PURGE_PLUGIN
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const core = await import(pathToFileURL(path.join(PLUGIN, "lib", "core.js")).href);

const bases = core.enumeratePatchAiBases({ discover: true });
console.log(`宿主: ${bases.length}`);
for (const b of bases) console.log(`  ${b}`);
if (bases.length === 0) {
  console.error("\n没找到宿主。设置 DSH_BASE 指向含 dsh-agent-instructions/lib 的 @deepseek-ai 目录。");
  process.exit(2);
}

const before = await core.patchStatus(bases[0]);
console.log("\n=== 应用前 #40 ===");
console.log(`  ${before[40]}`);

const result = await core.applyPatchesAllHosts(core.ALL_PATCHES, {
  preserveClientBundles: false,
  forApply: true,
});

console.log("\n=== 应用后 ===");
for (const h of result.hosts) {
  console.log(`  ${h.aiBase}`);
  console.log(`    hostWritten: ${h.hostWritten}`);
  const row = h.report.find((r) => r.patch_id === 40 || r.id === 40);
  console.log(`    #40: ${row ? row.status : "(无行)"}`);
  if (row && row.status === "pattern_not_found") {
    console.log(`    ★ 仍然 pattern_not_found：这个宿主版本的 assemble 原文又变了`);
  }
}

const after = await core.patchStatus(bases[0]);
console.log("\n=== 应用后 #40（磁盘状态）===");
console.log(`  ${after[40]}`);
const written = result.hosts.map((h) => ({ aiBase: h.aiBase, hostWritten: h.hostWritten }));
console.log(`\nallPatchHostsWritten = ${core.allPatchHostsWritten(written)}`);

const pending = Object.entries(after).filter(([, s]) => s === "pending").map(([id]) => id);
console.log(`pending 补丁 = ${pending.length ? pending.join(", ") : "无"}`);

const ok = core.allPatchHostsWritten(written) && pending.length === 0;
console.log(ok ? "\n可以重启" : "\n仍不可重启");
process.exit(ok ? 0 : 1);
