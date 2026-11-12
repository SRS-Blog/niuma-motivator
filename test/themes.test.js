'use strict';
const assert = require('assert');
const Themes = require('../renderer/themes.js');

// 预设皮肤：id 唯一、颜色合法、透明度在范围内
assert.ok(Themes.THEMES.length >= 5, '至少 5 套预设皮肤');
const ids = new Set(Themes.THEMES.map((t) => t.id));
assert.strictEqual(ids.size, Themes.THEMES.length, '皮肤 id 不能重复');
assert.ok(ids.has(Themes.DEFAULT_THEME_ID), '默认皮肤必须存在');
assert.ok(!ids.has('custom'), "'custom' 是保留 id");

for (const t of Themes.THEMES) {
  for (const key of ['accent1', 'accent2', 'bg']) {
    assert.strictEqual(Themes.normalizeHex(t[key], null), t[key], `${t.name}.${key} 应为小写 6 位 hex`);
  }
  assert.ok(t.opacity >= 0.2 && t.opacity <= 1, `${t.name} 的默认透明度应在 0.2~1`);
  assert.ok(t.name && typeof t.name === 'string');
}

// hex 规范化
assert.strictEqual(Themes.normalizeHex('#ABC', '#000000'), '#aabbcc');
assert.strictEqual(Themes.normalizeHex(' #FfD76A ', '#000000'), '#ffd76a');
assert.strictEqual(Themes.normalizeHex('red', '#000000'), '#000000');
assert.strictEqual(Themes.normalizeHex('#12345', '#000000'), '#000000');
assert.strictEqual(Themes.normalizeHex(null, '#000000'), '#000000');
assert.strictEqual(Themes.normalizeHex(123, '#000000'), '#000000');

// 明暗判断
assert.strictEqual(Themes.isLight('#f7f2ea'), true, '奶油白是浅色');
assert.strictEqual(Themes.isLight('#ffffff'), true);
assert.strictEqual(Themes.isLight('#0f1118'), false, '暗夜底色是深色');
assert.strictEqual(Themes.isLight('#000000'), false);

// 取皮肤：预设 / 自定义 / 非法 id 回退
assert.strictEqual(Themes.getThemeById('sakura', null).name, '樱花粉');
const custom = Themes.getThemeById('custom', { accent1: '#123456', accent2: '#654321', bg: '#101010' });
assert.strictEqual(custom.id, 'custom');
assert.strictEqual(custom.accent1, '#123456');
assert.strictEqual(custom.bg, '#101010');
const customBad = Themes.getThemeById('custom', { accent1: 'oops', accent2: '#654321', bg: null });
assert.strictEqual(customBad.accent1, Themes.CUSTOM_FALLBACK.accent1, '非法自定义色回退');
assert.strictEqual(customBad.bg, Themes.CUSTOM_FALLBACK.bg);
assert.strictEqual(Themes.getThemeById('custom', null).accent1, Themes.CUSTOM_FALLBACK.accent1);
assert.strictEqual(Themes.getThemeById('nope', null).id, Themes.DEFAULT_THEME_ID, '未知 id 回退默认皮肤');

// CSS 变量：深色 / 浅色皮肤的正文颜色不同
const dark = Themes.themeVars(Themes.getThemeById('night-gold'));
const light = Themes.themeVars(Themes.getThemeById('cream'));
for (const v of [dark, light]) {
  for (const key of ['--accent-1', '--accent-2', '--bg', '--num', '--text', '--text-dim', '--line', '--track', '--panel', '--ok']) {
    assert.ok(v[key], `缺少变量 ${key}`);
  }
}
assert.strictEqual(dark['--num'], '#ffffff', '深色皮肤数字为白色');
assert.notStrictEqual(light['--num'], '#ffffff', '浅色皮肤数字应为深色');
assert.notStrictEqual(dark['--text'], light['--text']);

// applyTheme：accentsOnly 只写强调色
const makeEl = () => {
  const store = {};
  return { store, style: { setProperty: (k, val) => { store[k] = val; } } };
};
const full = makeEl();
Themes.applyTheme(full, Themes.getThemeById('mint'));
assert.strictEqual(full.store['--accent-1'], '#6ee7b7');
assert.ok(full.store['--bg'] && full.store['--text']);
const part = makeEl();
Themes.applyTheme(part, Themes.getThemeById('mint'), { accentsOnly: true });
assert.deepStrictEqual(Object.keys(part.store).sort(), ['--accent-1', '--accent-2']);

// 背景图规范化：只接受图片 data URL，垃圾 / 超大一律回退
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
assert.strictEqual(Themes.normalizeImage(TINY_PNG, ''), TINY_PNG, '合法 PNG data URL 保留');
assert.strictEqual(Themes.normalizeImage('data:image/jpeg;base64,/9j/4AAQ', ''), 'data:image/jpeg;base64,/9j/4AAQ');
assert.strictEqual(Themes.normalizeImage('data:text/html;base64,PGh0bWw+', ''), '', '非图片类型拒绝');
assert.strictEqual(Themes.normalizeImage('data:image/svg+xml;base64,PHN2Zz4=', ''), '', 'svg 拒绝');
assert.strictEqual(Themes.normalizeImage('https://evil.example/x.png', ''), '', '外链拒绝');
assert.strictEqual(Themes.normalizeImage('data:image/png;base64,not base64!!', ''), '', '非法 base64 拒绝');
assert.strictEqual(Themes.normalizeImage(123, 'fb'), 'fb', '非字符串回退');
assert.strictEqual(Themes.normalizeImage('data:image/png;base64,' + 'A'.repeat(7000000), ''), '', '超大图拒绝');
assert.strictEqual(Themes.CUSTOM_FALLBACK.image, '', '默认无背景图');
assert.strictEqual(Themes.getThemeById('custom', { image: 'junk' }).image, '', '非法背景图回退');
assert.strictEqual(Themes.getThemeById('custom', { image: TINY_PNG }).image, TINY_PNG, '合法背景图透传');

console.log('✓ themes.test.js 全部通过');
