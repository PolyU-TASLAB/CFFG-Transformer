"use strict";
// Static translations are authored in index.html; measurements remain separate.
(() => {
  let language = "en"; // Start in English on every load, regardless of browser locale.
  const elements = [...document.querySelectorAll("[data-zh]")].map(el => ({el, en: el.innerHTML, zh: el.dataset.zh}));
  const labels = [...document.querySelectorAll("[data-zh-aria]")].map(el => ({el, en: el.getAttribute("aria-label"), zh: el.dataset.zhAria}));
  const strings = {
    en: {
      missing: "Results could not be loaded. Please refresh the page.",
      title: "CFFG — Learned measurements. Physics-based estimation.",
      description: "CFFG: temporal Transformer measurement correction for UWB/IMU localization. Trajectory comparisons and test-set results."
    },
    zh: {
      missing: "结果加载失败，请刷新页面。",
      title: "CFFG — 学习量测修正，融合 UWB 与 IMU 定位",
      description: "CFFG：时序 Transformer 与 UWB/IMU 因子图融合定位。展示两组轨迹效果对比与完整测试集指标。"
    }
  };
  function t(key, values = {}) {
    if (!(key in strings[language])) throw new Error("Missing translation: " + key);
    return strings[language][key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  }
  function setLanguage(next) {
    if (!Object.prototype.hasOwnProperty.call(strings, next)) return;
    language = next;
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    elements.forEach(item => { item.el.innerHTML = item[next]; });
    labels.forEach(item => item.el.setAttribute("aria-label", item[next]));
    document.title = t("title");
    document.querySelector('meta[name="description"]').content = t("description");
    document.querySelectorAll("[data-language]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.language === next)));
    document.dispatchEvent(new CustomEvent("cffg-language-change", {detail: {language}}));
  }
  window.CFFG_I18N = {t, setLanguage, get language() { return language; }};
  document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => setLanguage(button.dataset.language)));
  setLanguage("en");
})();
