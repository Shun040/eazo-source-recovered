/* 公共工具 / Shared helpers
 * 必须在所有模块脚本之前加载（index.html 里排第一）。
 * 各模块用 `const { t, getState, saveState, esc } = window.eazoUtil;` 取用，
 * 不再各自复制粘贴一份。全部按调用时才读取 window.eazoI18n / eazoGetState，
 * 所以加载顺序不会影响结果。
 */
(() => {
  "use strict";

  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  /** 转义 HTML，防止把文本直接拼进 innerHTML 时被当成标签。 */
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ESC_MAP[m]);

  /** 取翻译；i18n 还没就绪时退回 key 本身。 */
  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);

  /** 读取 / 保存全局存档（由 app.js 提供）。 */
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();

  window.eazoUtil = Object.freeze({ esc, t, getState, saveState });
})();
