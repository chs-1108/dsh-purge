// 诊断「清洗没有写进全部宿主，已取消重启」
// 用法: node scripts/diagnose-hosts.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 脚本在 <plugin>/scripts/ 下，插件根是它的上一级。
const PLUGIN = process.env.DSH_PURGE_PLUGIN
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const core = await import(pathToFileURL(path.join(PLUGIN, "lib", "core.js")).href);
console.log(`plugin root: ${PLUGIN}\n`);

const bases = core.enumeratePatchAiBases({ discover: true });
console.log(`enumeratePatchAiBases(discover=true) → ${bases.length} 个宿主\n`);

const rows = [];
for (const aiBase of bases) {
  const sp = path.join(aiBase, "dsh-system-prompt", "lib", "index.js");
  const exists = fs.existsSync(sp);
  let keeps = false;
  let size = 0;
  if (exists) {
    try {
      const text = fs.readFileSync(sp, "utf8");
      size = text.length;
      keeps = core.hostPromptKeepsInject(text);
    } catch (e) {
      keeps = `read_error: ${e.message}`;
    }
  }
  let status = {};
  try {
    status = await core.patchStatus(aiBase);
  } catch (e) {
    status = { __error: String(e.message || e) };
  }
  const pending = Object.entries(status).filter(([, s]) => s === "pending").map(([id]) => id);
  rows.push({
    aiBase,
    spExists: exists,
    spSize: size,
    hostWritten: core.hostCleanMarkersPresent(aiBase),
    keeps,
    pending,
  });
}

for (const r of rows) {
  console.log("─".repeat(100));
  console.log(`aiBase     : ${r.aiBase}`);
  console.log(`system-prompt/lib/index.js : ${r.spExists ? `存在 ${r.spSize} 字节` : "★ 不存在"}`);
  console.log(`hostWritten: ${r.hostWritten}   keepsInject: ${r.keeps}`);
  console.log(`pending    : ${r.pending.length ? r.pending.join(", ") : "无"}`);
}

console.log("─".repeat(100));
const bad = rows.filter((r) => r.hostWritten !== true);
console.log(`\n未写入标记的宿主: ${bad.length} / ${rows.length}`);
for (const r of bad) console.log(`  ✗ ${r.aiBase}`);
console.log(`\nallPatchHostsWritten = ${core.allPatchHostsWritten(rows.map((r) => ({ hostWritten: r.hostWritten })))}`);
