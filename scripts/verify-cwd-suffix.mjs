// 本地验证：确认 persona 后缀 / 其它段不再带宿主未注册的 {{…}}。
// 用法：node scripts/verify-cwd-suffix.mjs [插件目录]
// 宿主包位置可用 DSH_AI_BASE 覆盖。
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const HOST_CANDIDATES = [
  process.env.DSH_AI_BASE,
  "C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app/dsh/node_modules/@deepseek-ai",
  "C:/Users/Administrator/AppData/Local/Programs/DeepSeek Harness/resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai",
].filter(Boolean);
const HOST = HOST_CANDIDATES.find((dir) => existsSync(path.join(dir, "dsh-system-prompt", "lib", "index.js")));
if (!HOST) {
  console.error(`找不到宿主 dsh-system-prompt；试过：\n  ${HOST_CANDIDATES.join("\n  ")}\n用 DSH_AI_BASE 指定 @deepseek-ai 目录。`);
  process.exit(1);
}
const pluginRoot = path.resolve(process.argv[2] || fileURLToPath(new URL("..", import.meta.url)));

const { renderPrompt } = await import(pathToFileURL(path.join(HOST, "dsh-system-prompt", "lib", "index.js")).href);
const { rewritePromptAssembly } = await import(pathToFileURL(path.join(pluginRoot, "lib", "identity.js")).href);

const CWD = "D:\\我的文档\\Documents\\deepseek-harness\\default-workspace";
const context = { agent: { session: { header: { cwd: CWD } } } };
// 宿主当前真实注册的变量：只有 provider / model
const variables = { provider: "a", model: "deepseek-v4.1-flash-1017" };

let failures = 0;
function check(label, suffixText, ctx = context) {
  const assembled = {
    sections: [
      { name: "deployment:persona-prefix", text: "", order: 0 },
      ...(suffixText === null ? [] : [{ name: "deployment:persona-suffix", text: suffixText, order: 10200 }]),
      { name: "harness:extra", text: "路径 {{cwd}} / 模型 {{model}} / 未知 {{weird_var}} / 半截 {{", order: 5000 },
      { name: "dsh-purge:literal", text: "原样 {{cwd}}", interpolate: false, order: -100000 },
    ],
    contexts: [],
    tools: [],
    variables,
  };
  let rendered;
  try {
    rendered = renderPrompt(rewritePromptAssembly(assembled, { fallbackInject: "OPERATOR INJECT", context: ctx }));
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${label}\n      ${error.message}`);
    return;
  }
  const suffix = rendered.split("\n\n").find((part) => /working directory|后缀/.test(part)) ?? "(无后缀)";
  const extra = rendered.split("\n\n").find((part) => part.startsWith("路径 ")) ?? "(无 extra)";
  const literal = rendered.split("\n\n").find((part) => part.startsWith("原样 ")) ?? "(无 literal)";
  // literal 段 interpolate:false，宿主不会解析，保留 {{cwd}} 是预期行为。
  const checked = rendered.replace("原样 {{cwd}}", "");
  const bad = checked.includes("{{cwd}}") || checked.includes("{{weird_var}}") || checked.includes("{{model}}");
  if (bad) failures += 1;
  console.log(`${bad ? "FAIL" : "OK  "}  ${label}`);
  console.log(`      suffix  | ${suffix}`);
  console.log(`      extra   | ${extra}`);
  console.log(`      literal | ${literal}`);
}

check("标准后缀 {{cwd}}", "Your working directory is {{cwd}}.");
check("空后缀", "");
check("自定义后缀带 {{cwd}}", "自定义后缀 {{cwd}} 尾巴");
check("宿主根本没给 suffix 段", null);
check("无 session（拿不到 cwd）", "Your working directory is {{cwd}}.", {});

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exitCode = failures === 0 ? 0 : 1;
