'use strict';
/* 牛马鼓励器 —— 皮肤定义与配色计算（主进程 / 悬浮窗 / 设置窗口共用） */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Themes = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const THEMES = [
    { id: 'night-gold', name: '暗夜金', accent1: '#ffd76a', accent2: '#f5a524', bg: '#0f1118', opacity: 0.92 },
    { id: 'sakura',     name: '樱花粉', accent1: '#ff9ec7', accent2: '#ec5f9e', bg: '#1b0f16', opacity: 0.93 },
    { id: 'mint',       name: '薄荷绿', accent1: '#6ee7b7', accent2: '#25b183', bg: '#0b1512', opacity: 0.93 },
    { id: 'ocean',      name: '海盐蓝', accent1: '#7cc7ff', accent2: '#3b8fe8', bg: '#0c1320', opacity: 0.93 },
    { id: 'taro',       name: '香芋紫', accent1: '#c4b5fd', accent2: '#8b5cf6', bg: '#120f21', opacity: 0.93 },
    { id: 'cream',      name: '奶油白', accent1: '#e2a63c', accent2: '#bc7d15', bg: '#f7f2ea', opacity: 0.97 },
  ];
  const DEFAULT_THEME_ID = 'night-gold';
  const CUSTOM_FALLBACK = { accent1: '#ffd76a', accent2: '#f5a524', bg: '#0f1118', image: '' };

  const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  // 背景图只接受图片类型的 data URL（本地上传后压缩成 base64 存进配置）
  const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  const IMAGE_MAX_LEN = 6000000; // data URL 长度上限（约 4.5MB 图片）

  function normalizeHex(v, fallback) {
    if (typeof v !== 'string') return fallback;
    let s = v.trim();
    if (!HEX_RE.test(s)) return fallback;
    if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return s.toLowerCase();
  }

  function normalizeImage(v, fallback) {
    const fb = fallback === undefined ? '' : fallback;
    if (typeof v !== 'string') return fb;
    const s = v.trim();
    if (!s || s.length > IMAGE_MAX_LEN || !IMAGE_RE.test(s)) return fb;
    return s;
  }

  function hexToRgb(hex) {
    const h = normalizeHex(hex, '#000000').slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function isLight(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000 / 255 > 0.55;
  }

  function getThemeById(id, custom) {
    const p = THEMES.find((t) => t.id === id);
    if (p) return p;
    if (id === 'custom') {
      const c = custom || CUSTOM_FALLBACK;
      return {
        id: 'custom', name: '自定义',
        accent1: normalizeHex(c.accent1, CUSTOM_FALLBACK.accent1),
        accent2: normalizeHex(c.accent2, CUSTOM_FALLBACK.accent2),
        bg: normalizeHex(c.bg, CUSTOM_FALLBACK.bg),
        image: normalizeImage(c.image, CUSTOM_FALLBACK.image),
      };
    }
    return THEMES[0];
  }

  // 由一套配色推导出整套 CSS 变量（正文 / 线条 / 面板色都跟随背景明暗）
  function themeVars(t) {
    const light = isLight(t.bg);
    return {
      '--accent-1': t.accent1,
      '--accent-2': t.accent2,
      '--bg': t.bg,
      '--num': light ? '#23262b' : '#ffffff',
      '--text': light ? 'rgba(28, 30, 36, 0.92)' : '#eef1f7',
      '--text-dim': light ? 'rgba(28, 30, 36, 0.60)' : 'rgba(238, 241, 247, 0.58)',
      '--text-faint': light ? 'rgba(28, 30, 36, 0.42)' : 'rgba(238, 241, 247, 0.38)',
      '--line': light ? 'rgba(0, 0, 0, 0.10)' : 'rgba(255, 255, 255, 0.08)',
      '--track': light ? 'rgba(0, 0, 0, 0.10)' : 'rgba(255, 255, 255, 0.09)',
      '--panel': light ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.06)',
      '--panel-strong': light ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.10)',
      '--card-border': light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.09)',
      '--veil': light ? 'rgba(255, 255, 255, 0)' : 'rgba(255, 255, 255, 0.05)',
      '--shadow': light ? '0 4px 14px rgba(30, 30, 40, 0.18)' : '0 4px 12px rgba(0, 0, 0, 0.28)',
      '--ok': light ? '#1f9d57' : '#7ce8a8',
      '--danger': light ? '#c9372c' : '#ffb3b3',
      '--warn': light ? '#b45309' : '#ffb86b',
    };
  }

  function applyTheme(el, theme, opts) {
    const accentsOnly = !!(opts && opts.accentsOnly);
    const vars = themeVars(theme);
    for (const k of Object.keys(vars)) {
      if (accentsOnly && k !== '--accent-1' && k !== '--accent-2') continue;
      el.style.setProperty(k, vars[k]);
    }
  }

  return { THEMES, DEFAULT_THEME_ID, CUSTOM_FALLBACK, normalizeHex, normalizeImage, isLight, getThemeById, themeVars, applyTheme };
});
