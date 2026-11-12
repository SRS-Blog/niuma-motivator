'use strict';
/* 牛马鼓励器 —— 配置核心（纯函数，不依赖 Electron，可单测）
 *
 * 约定：
 * - 所有函数都不修改入参，返回新的配置对象
 * - 不变量：theme.opacityMap[theme.current] === ui.opacity（当前皮肤记住的就是当前透明度）
 */
const themes = require('./renderer/themes');

const DEFAULT_CONFIG = {
  salary: {
    monthly: 5000,
    workDays: [1, 2, 3, 4, 5],       // 1=周一 ... 7=周日
    workStart: '09:00',
    workEnd: '18:00',
    lunchEnabled: true,
    lunchStart: '12:00',
    lunchEnd: '13:00',
    payday: 15,                       // 每月发薪日，null = 不显示
  },
  wishes: [
    { id: 'seed-1', emoji: '☕', name: '一杯冰美式', price: 32 },
    { id: 'seed-2', emoji: '🎮', name: 'Switch 2', price: 2599 },
    { id: 'seed-3', emoji: '🏖️', name: '去海边躺一天', price: 1500 },
  ],
  ui: { opacity: 0.92, alwaysOnTop: true, clickThrough: false },
  theme: {
    current: themes.DEFAULT_THEME_ID,          // 预设皮肤 id 或 'custom'
    custom: { ...themes.CUSTOM_FALLBACK },     // 自定义配色
    opacityMap: {},                            // 每个皮肤各自记住的不透明度
  },
  behavior: { launchAtLogin: false },
  window: { x: null, y: null, width: 400, height: 340 },
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    if (pv === undefined) continue;
    out[k] = isPlainObject(pv) && isPlainObject(out[k]) ? deepMerge(out[k], pv) : pv;
  }
  return out;
}

function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// 补全默认值并校验每个字段；任何脏数据都会被修正为合法值
function sanitize(input) {
  const c = deepMerge(DEFAULT_CONFIG, isPlainObject(input) ? input : {});
  if (!isPlainObject(c.salary)) c.salary = { ...DEFAULT_CONFIG.salary };
  if (!isPlainObject(c.ui)) c.ui = { ...DEFAULT_CONFIG.ui };
  if (!isPlainObject(c.theme)) c.theme = { ...DEFAULT_CONFIG.theme };
  if (!isPlainObject(c.behavior)) c.behavior = { ...DEFAULT_CONFIG.behavior };
  if (!isPlainObject(c.window)) c.window = { ...DEFAULT_CONFIG.window };

  const s = c.salary;
  s.monthly = clampNum(s.monthly, 0, 1e7, 5000);
  s.workDays = [...new Set((Array.isArray(s.workDays) ? s.workDays : [])
    .map((n) => Math.round(Number(n)))
    .filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b);
  if (!s.workDays.length) s.workDays = [1, 2, 3, 4, 5];

  const tm = (v, dflt) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v));
    if (!m) return dflt;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return dflt;
    return String(h).padStart(2, '0') + ':' + m[2];
  };
  s.workStart = tm(s.workStart, '09:00');
  s.workEnd = tm(s.workEnd, '18:00');
  s.lunchStart = tm(s.lunchStart, '12:00');
  s.lunchEnd = tm(s.lunchEnd, '13:00');
  s.lunchEnabled = !!s.lunchEnabled;
  const pd = Number(s.payday);
  s.payday = s.payday === null || s.payday === undefined || s.payday === ''
    ? null
    : (Number.isFinite(pd) && pd >= 1 && pd <= 31 ? Math.round(pd) : null);

  c.wishes = (Array.isArray(c.wishes) ? c.wishes : [])
    .slice(0, 12)
    .map((w, i) => {
      const o = isPlainObject(w) ? w : {};
      return {
        id: String(o.id || ('w-' + Date.now().toString(36) + '-' + i)),
        emoji: String(o.emoji || '🎯').slice(0, 8),
        name: String(o.name || '小目标').slice(0, 24),
        price: clampNum(o.price, 0.01, 99999999, 100),
      };
    });

  c.ui.opacity = clampNum(c.ui.opacity, 0.2, 1, 0.92);
  c.ui.alwaysOnTop = !!c.ui.alwaysOnTop;
  c.ui.clickThrough = !!c.ui.clickThrough;
  c.behavior.launchAtLogin = !!c.behavior.launchAtLogin;

  // 皮肤
  const fb = themes.CUSTOM_FALLBACK;
  const cc = isPlainObject(c.theme.custom) ? c.theme.custom : {};
  c.theme.custom = {
    accent1: themes.normalizeHex(cc.accent1, fb.accent1),
    accent2: themes.normalizeHex(cc.accent2, fb.accent2),
    bg: themes.normalizeHex(cc.bg, fb.bg),
    image: themes.normalizeImage(cc.image, fb.image),
  };
  if (c.theme.current !== 'custom' && !themes.THEMES.some((t) => t.id === c.theme.current)) {
    c.theme.current = themes.DEFAULT_THEME_ID;
  }
  const oldMap = isPlainObject(c.theme.opacityMap) ? c.theme.opacityMap : {};
  const opacityMap = {};
  for (const t of themes.THEMES) opacityMap[t.id] = clampNum(oldMap[t.id], 0.2, 1, t.opacity);
  opacityMap.custom = clampNum(oldMap.custom, 0.2, 1, c.ui.opacity);
  c.theme.opacityMap = opacityMap;

  c.window.width = 400;
  c.window.height = clampNum(c.window.height, 140, 720, 340);
  const numOrNull = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
  c.window.x = numOrNull(c.window.x);
  c.window.y = numOrNull(c.window.y);
  if (c.window.x === null || c.window.y === null) { c.window.x = null; c.window.y = null; }

  return c;
}

function rememberOpacity(c) {
  c.theme.opacityMap[c.theme.current] = c.ui.opacity;
  return c;
}

/** 载入配置（raw 可为 undefined 或脏数据）：补默认值、校验，并把当前透明度记到当前皮肤名下 */
function initConfig(raw) {
  return rememberOpacity(sanitize(raw));
}

/**
 * 应用一份增量补丁（来自设置窗口 / 悬浮窗），返回新配置。
 * - window（位置 / 高度）以主进程为准，补丁里的会被忽略
 * - theme 只接受自定义配色；切换皮肤必须走 switchTheme（要联动透明度）
 * - 透明度变化会记到当前皮肤名下
 */
function applyPatch(cfg, patch) {
  const p = isPlainObject(patch) ? { ...patch } : {};
  delete p.window;
  if (isPlainObject(p.theme) && isPlainObject(p.theme.custom)) p.theme = { custom: p.theme.custom };
  else delete p.theme;
  return rememberOpacity(sanitize(deepMerge(cfg, p)));
}

/** 换肤：切到目标皮肤并带出它记住的不透明度，返回新配置；未知 id 返回 null */
function switchTheme(cfg, id) {
  if (id !== 'custom' && !themes.THEMES.some((t) => t.id === id)) return null;
  const c = rememberOpacity(sanitize(cfg)); // 先把当前透明度记到旧皮肤名下
  c.theme.current = id;
  c.ui.opacity = c.theme.opacityMap[id];
  return c;
}

module.exports = {
  DEFAULT_CONFIG, isPlainObject, deepMerge, clampNum,
  sanitize, initConfig, applyPatch, switchTheme,
};
