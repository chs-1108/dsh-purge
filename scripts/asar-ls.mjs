// 只读：列出 asar 归档里某个目录下的条目，用来和已解开的目录比对完整性。
// 用法: node scripts/asar-ls.mjs <asar> <目录> [--count]
import fs from "node:fs";

const [asarPath, dir, flag] = process.argv.slice(2);
const fd = fs.openSync(asarPath, "r");
const pre = Buffer.alloc(16);
fs.readSync(fd, pre, 0, 16, 0);
const headerSize = pre.readUInt32LE(4);
const jsonSize = pre.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, 16);
fs.closeSync(fd);
const header = JSON.parse(jsonBuf.toString("utf8"));

let node = header;
for (const part of String(dir || "").replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean)) {
  node = node?.files?.[part];
  if (!node) {
    console.error(`归档里没有: ${dir}`);
    process.exit(1);
  }
}
const names = Object.keys(node.files || {}).sort();
if (flag === "--count") {
  console.log(names.length);
} else {
  for (const name of names) {
    const info = node.files[name];
    console.log(`${info.files ? "dir " : "file"} ${name}`);
  }
}
