// 只读：把补丁表里改过的每个宿主文件做一次语法检查，并和 asar 里的原件对照。
// 只有「原件能过、改后过不了」才算真的坏了。
// 用法: node scripts/verify-host-tree.mjs <app.asar> <resources/app>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN = process.env.DSH_PURGE_PLUGIN
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const core = await import(pathToFileURL(path.join(PLUGIN, "lib", "core.js")).href);

const [asarPath, appDir] = process.argv.slice(2);
if (!asarPath || !appDir) {
  console.error("用法: node scripts/verify-host-tree.mjs <app.asar> <resources/app>");
  process.exit(2);
}

const aiBase = path.join(appDir, "dsh", "node_modules", "@deepseek-ai");
const files = core.targetFiles(aiBase);
const targets = [...new Set(Object.values(files).flat().flat(Infinity).filter((x) => typeof x === "string"))]
  .filter((fp) => /\.(js|mjs|cjs)$/i.test(fp));

console.log(`补丁涉及的 JS 文件: ${targets.length}`);

// --- 读 asar 头，按需取原件 ---
const fd = fs.openSync(asarPath, "r");
const pre = Buffer.alloc(16);
fs.readSync(fd, pre, 0, 16, 0);
const headerSize = pre.readUInt32LE(4);
const jsonSize = pre.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
const header = JSON.parse(jsonBuf.toString("utf8"));
const dataOffset = 8 + headerSize;

function pristineBytes(rel) {
  let node = header;
  for (const part of rel.replace(/\\/g, "/").split("/").filter(Boolean)) {
    node = node?.files?.[part];
    if (!node) return null;
  }
  if (node.files) return null;
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataOffset + Number(node.offset));
  return buf;
}
fs.closeSync(fd);

function syntaxOk(file) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return { ok: true };
  } catch (e) {
    const msg = String(e.stderr || e.message || "").split("\n").find((l) => /Error|error/.test(l)) || "";
    return { ok: false, msg: msg.trim().slice(0, 120) };
  }
}

const tmp = path.join(appDir, "..", ".dshpurge-verify");
fs.mkdirSync(tmp, { recursive: true });

let broken = 0;
let checked = 0;
for (const fp of targets) {
  if (!fs.existsSync(fp)) {
    console.log(`  缺失  ${path.relative(appDir, fp)}`);
    continue;
  }
  checked += 1;
  const disk = syntaxOk(fp);
  if (disk.ok) continue;

  // 改后不通过：拿原件对照
  const rel = path.relative(appDir, fp).split(path.sep).join("/");
  const src = pristineBytes(rel);
  let srcOk = null;
  if (src) {
    const p = path.join(tmp, "pristine-" + path.basename(fp));
    fs.writeFileSync(p, src);
    srcOk = syntaxOk(p).ok;
  }
  if (srcOk === true) {
    broken += 1;
    console.log(`  ★ 坏了  ${rel}\n          ${disk.msg}`);
  } else {
    console.log(`  (原件也不过，忽略) ${rel}`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n检查 ${checked} 个文件，补丁引入的语法错误: ${broken}`);
process.exit(broken === 0 ? 0 : 1);
