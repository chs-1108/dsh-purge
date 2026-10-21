// 中性标记优先，旧标记兜底：宿主文件可能是迁移前写下的（[dsh-purge]），
// 也可能是迁移后的（[cfg]）。只认一种会把已清洗的宿主判成"没洗过"，
// 触发多余的重打，甚至在重启前误判失败。
const MARKS = ["[cfg]", "[dsh-purge]"];

function marked(body, tail) {
  return MARKS.some((mark) => body.includes(`${mark} ${tail}`));
}

/** 重启前看系统提示词文件：标记写上了，或者当前原文里已经没有那两处旧拦截。 */
export function hostPromptKeepsInject(text) {
  const body = String(text || "");
  const identityMarked = marked(body, "identity stripped");
  const injectMarked = marked(body, "complete prompt keeps waterfall inject")
    || marked(body, "complete prompt keeps inject");
  if (identityMarked && injectMarked) return true;
  // 空文件或不是这份模块，不能当成已经洗过。
  if (!body.includes("system-prompt/assemble")) return false;
  const identityLeft = body.includes("You are an AI agent powered by DeepSeek Harness.");
  const dropsInject = body.includes("transformed.sections : [completeSection]");
  return !identityLeft && !dropsInject;
}
