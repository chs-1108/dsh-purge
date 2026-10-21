// 只读：从 app.asar 里取单个文件，不解包整份归档。
// 用法: node scripts/asar-read.mjs <asar> <内路径> [输出文件]
import fs from "node:fs";

const [asarPath, inner, outPath] = process.argv.slice(2);
if (!asarPath || !inner) {
  console.error("用法: node scripts/asar-read.mjs <app.asar> <lib/main.js> [out]");
  process.exit(2);
}

const fd = fs.openSync(asarPath, "r");
const pre = Buffer.alloc(16);
fs.readSync(fd, pre, 0, 16, 0);
if (pre.readUInt32LE(0) !== 4) throw new Error("不是 asar 归档");
const headerSize = pre.readUInt32LE(4);
const jsonSize = pre.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
const header = JSON.parse(jsonBuf.toString("utf8"));
const dataOffset = 8 + headerSize;

const parts = String(inner).replace(/\\/g, "/").replace(/^\/+/, "").split("/");
let node = header;
for (const part of parts) {
  node = node?.files?.[part];
  if (!node) {
    console.error(`归档里没有: ${inner}`);
    process.exit(1);
  }
}
if (node.files) {
  console.error(`${inner} 是目录，不是文件`);
  process.exit(1);
}

const buf = Buffer.alloc(node.size);
fs.readSync(fd, buf, 0, node.size, dataOffset + Number(node.offset));
fs.closeSync(fd);

if (outPath) {
  fs.writeFileSync(outPath, buf);
  console.log(`已写出 ${outPath}  (${node.size} 字节)`);
} else {
  process.stdout.write(buf);
}
