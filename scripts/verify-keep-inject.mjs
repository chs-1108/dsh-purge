// 验证 #40 COMPLETE_PROMPT_KEEP_INJECT 能匹配当前宿主，并真的写上标记。
// 只读：不写宿主文件。用法: node scripts/verify-keep-inject.mjs [host-index.js]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN = process.env.DSH_PURGE_PLUGIN
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const core = await import(pathToFileURL(path.join(PLUGIN, "lib", "core.js")).href);

const TARGET = process.argv[2] || path.join(
  process.env.LOCALAPPDATA || "",
  "Programs", "DeepSeek Harness", "resources", "app", "dsh",
  "node_modules", "@deepseek-ai", "dsh-system-prompt", "lib", "index.js",
);

const patch = core.ALL_PATCHES.find((p) => p.id === 40);
if (!patch) throw new Error("找不到补丁 #40");

const source = fs.readFileSync(TARGET, "utf8");
const asLf = (s) => String(s || "").replace(/\r\n/g, "\n");
const normalizeMarks = (s) => s.replace(/\[dsh-purge\]/g, "[cfg]");

console.log(`宿主文件: ${TARGET}`);
console.log(`补丁 #40: ${patch.name}  markersAny=${patch.markersAny}\n`);

// 已经打过的宿主上，原始 pattern 当然匹配不到——那是「已应用」，不是「匹配不上」。
if (core.patchApplied(source, patch)) {
  const keeps = core.hostPromptKeepsInject(source);
  console.log("补丁 #40 已经打在这个宿主上（原始 pattern 已不存在）。");
  console.log(`  hostPromptKeepsInject = ${keeps}`);
  console.log(keeps ? "\n全部通过（已是应用后状态）" : "\n未通过：标记在但自检不认，检查 host-clean.js 的判定条件");
  process.exit(keeps ? 0 : 1);
}

let hit = null;
patch.replacements.forEach((r, i) => {
  const ok = r.pattern instanceof RegExp
    ? new RegExp(r.pattern.source, String(r.pattern.flags || "").replace("g", "")).test(asLf(source))
    : asLf(source).includes(asLf(r.pattern));
  console.log(`  replacement[${i}] ${r.pattern instanceof RegExp ? "regex" : "string"} → ${ok ? "★ 命中" : "未命中"}`);
  if (ok && !hit) hit = { index: i, ...r };
});

if (!hit) {
  console.log("\n结论: 没有任何 replacement 命中 → 标记写不上 → 重启校验会拒绝。");
  process.exit(1);
}

const re = new RegExp(hit.pattern.source, String(hit.pattern.flags || "").replace("g", "") + "g");
const after = asLf(source).replace(re, normalizeMarks(asLf(hit.replace)));
const out = source.includes("\r\n") ? after.replace(/\n/g, "\r\n") : after;

console.log(`\n命中 replacement[${hit.index}]，替换后:`);
console.log(`  含 [cfg] identity stripped            : ${normalizeMarks(out).includes("[cfg] identity stripped")}`);
console.log(`  含 complete prompt keeps ...          : ${normalizeMarks(out).includes("complete prompt keeps")}`);
console.log(`  仍有 transformed.sections : [completeSection] : ${out.includes("transformed.sections : [completeSection]")}`);
console.log(`  hostPromptKeepsInject(out)            : ${core.hostPromptKeepsInject(out)}`);
console.log(`  长度 ${source.length} → ${out.length}`);

// 幂等：再跑一遍不应该继续变
const again = asLf(out).replace(new RegExp(hit.pattern.source, String(hit.pattern.flags || "").replace("g", "") + "g"), normalizeMarks(asLf(hit.replace)));
console.log(`  幂等（二次替换无变化）                : ${again === asLf(out)}`);

const ok = core.hostPromptKeepsInject(out) && again === asLf(out);
console.log(ok ? "\n全部通过" : "\n未通过");
process.exit(ok ? 0 : 1);
