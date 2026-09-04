/* EAZO_STATIC_I18N_RUNTIME_V1 */
(() => {
  "use strict";

  const SUPPORTED_LOCALES = ["en-US", "zh-CN"];
  const DEFAULT_LOCALE = "zh-CN";
  const FALLBACK_LOCALE = "en-US";
  const STORAGE_KEY = "eazo.locale";
  const runtimeBaseUrl = new URL(
    ".",
    document.currentScript?.src || window.location.href,
  );

  let dictionaries = {};
  let localePreference = readPreference();
  let activeLocale = resolveLocale(localePreference);

  function normalizeLocale(value) {
    if (SUPPORTED_LOCALES.includes(value)) return value;
    const language = String(value || "").toLowerCase();
    if (language.startsWith("zh")) return "zh-CN";
    if (language.startsWith("en")) return "en-US";
    return DEFAULT_LOCALE;
  }

  function resolveLocale(preference) {
    if (preference === "system") {
      return normalizeLocale(navigator.language);
    }
    return normalizeLocale(preference || DEFAULT_LOCALE);
  }

  function readPreference() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "system" || SUPPORTED_LOCALES.includes(saved)) return saved;
    } catch (_error) {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    return "system";
  }

  function savePreference(preference) {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch (_error) {
      // The current page can still switch language without persistence.
    }
  }

  function valueAtPath(dictionary, key) {
    return key.split(".").reduce((value, segment) => value?.[segment], dictionary);
  }

  function interpolate(value, parameters) {
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => {
      const replacement = valueAtPath(parameters, key);
      return replacement == null ? "" : String(replacement);
    });
  }

  function t(key, parameters = {}) {
    const localized = valueAtPath(dictionaries[activeLocale], key);
    const fallback = valueAtPath(dictionaries[FALLBACK_LOCALE], key);
    const value = typeof localized === "string" ? localized : fallback;
    return typeof value === "string" ? interpolate(value, parameters) : key;
  }

  function translate(root = document) {
    const bindings = [
      ["data-i18n", "textContent"],
      ["data-i18n-placeholder", "placeholder"],
      ["data-i18n-aria-label", "aria-label"],
      ["data-i18n-title", "title"],
    ];

    for (const [attribute, target] of bindings) {
      root.querySelectorAll(`[${attribute}]`).forEach((element) => {
        const value = t(element.getAttribute(attribute));
        if (target === "textContent") element.textContent = value;
        else element.setAttribute(target, value);
      });
    }

    root.querySelectorAll("[data-i18n-locale-select]").forEach((select) => {
      select.value = localePreference;
      if (select.dataset.i18nBound === "true") return;
      select.dataset.i18nBound = "true";
      select.addEventListener("change", () => setLocale(select.value));
    });
  }

  async function loadDictionary(locale) {
    const response = await fetch(new URL(`locales/${locale}.json`, runtimeBaseUrl), {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Unable to load ${locale} translations`);
    const dictionary = await response.json();
    if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== "object") {
      throw new Error(`Invalid ${locale} translation dictionary`);
    }
    dictionaries[locale] = dictionary;
  }

  function applyLocale() {
    activeLocale = resolveLocale(localePreference);
    document.documentElement.lang = activeLocale;
    translate();
    window.dispatchEvent(
      new CustomEvent("eazo:localechange", {
        detail: { locale: activeLocale, preference: localePreference },
      }),
    );
  }

  async function setLocale(preference) {
    await ready;
    localePreference =
      preference === "system" ? "system" : normalizeLocale(preference);
    savePreference(localePreference);
    applyLocale();
    return activeLocale;
  }

  async function initialize() {
    const results = await Promise.allSettled(
      SUPPORTED_LOCALES.map((locale) => loadDictionary(locale)),
    );
    results.forEach((result) => {
      if (result.status === "rejected") console.warn(result.reason);
    });
    applyLocale();
    return activeLocale;
  }

  const ready = initialize();
  window.eazoI18n = {
    getLocale: () => activeLocale,
    getPreference: () => localePreference,
    ready,
    setLocale,
    t,
    translate,
  };

  window.addEventListener("languagechange", () => {
    if (localePreference === "system") applyLocale();
  });
})();
