'use strict';
const assert = require('assert');
const core = require('../config-core.js');
const Themes = require('../renderer/themes.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);
const invariant = (c, msg) => near(c.theme.opacityMap[c.theme.current], c.ui.opacity, `不变量（${msg}）`);

/* ---------- 初始化 / 默认值 ---------- */
let c = core.initConfig();
assert.strictEqual(c.theme.current, 'night-gold');
assert.strictEqual(c.salary.monthly, 5000, '默认月薪 5000');
assert.strictEqual(c.wishes.length, 3);
for (const t of Themes.THEMES) near(c.theme.opacityMap[t.id], t.opacity, `${t.name} 默认透明度`);
invariant(c, '默认配置');

// 脏数据不会让它崩
for (const bad of [null, 42, 'x', [], { salary: 5, ui: 'no', theme: [], wishes: 'nope', window: null }]) {
  const r = core.initConfig(bad);
  assert.strictEqual(r.salary.monthly, 5000, '脏数据回退默认月薪');
  assert.ok(Array.isArray(r.wishes));
  invariant(r, '脏数据');
}

/* ---------- 旧版配置迁移（没有 theme 字段，透明度 0.95） ---------- */
const legacy = {
  salary: { monthly: 23456, workDays: [1, 2, 3, 4, 5, 6], workStart: '9:30', workEnd: '19:00', payday: 10 },
  wishes: [{ id: 'a', emoji: '🚗', name: '小车车', price: 88888 }],
  ui: { opacity: 0.95, alwaysOnTop: false, clickThrough: false },
  window: { x: 100, y: 200, width: 400, height: 300 },
};
c = core.initConfig(legacy);
assert.strictEqual(c.salary.monthly, 23456, '迁移保留月薪');
assert.strictEqual(c.salary.workStart, '09:30', '时间补零');
assert.deepStrictEqual(c.salary.workDays, [1, 2, 3, 4, 5, 6]);
assert.strictEqual(c.wishes[0].name, '小车车', '迁移保留心愿单');
assert.strictEqual(c.ui.alwaysOnTop, false);
near(c.ui.opacity, 0.95, '迁移保留原透明度');
assert.strictEqual(c.theme.current, 'night-gold', '迁移后使用默认皮肤');
near(c.theme.opacityMap['night-gold'], 0.95, '原透明度记到默认皮肤名下');
assert.deepStrictEqual([c.window.x, c.window.y], [100, 200]);
assert.strictEqual(legacy.ui.opacity, 0.95, '不修改入参');
assert.strictEqual(legacy.theme, undefined, '不修改入参');

/* ---------- 增量补丁：只改提到的字段 ---------- */
let c2 = core.applyPatch(c, { salary: { monthly: 30000 } });
assert.strictEqual(c2.salary.monthly, 30000);
assert.strictEqual(c2.salary.payday, 10, '未提到的字段保持不变');
assert.strictEqual(c2.wishes[0].name, '小车车', '补丁不影响心愿单');
assert.strictEqual(c.salary.monthly, 23456, 'applyPatch 不修改入参');
invariant(c2, '改月薪');

// 透明度补丁 → 记到当前皮肤
c2 = core.applyPatch(c2, { ui: { opacity: 0.5 } });
near(c2.ui.opacity, 0.5, '透明度已更新');
near(c2.theme.opacityMap['night-gold'], 0.5, '透明度记到当前皮肤');
near(c2.theme.opacityMap.sakura, 0.93, '其它皮肤不受影响');
assert.strictEqual(c2.salary.monthly, 30000, '透明度补丁不影响月薪');

// 越界透明度被夹住
near(core.applyPatch(c2, { ui: { opacity: 5 } }).ui.opacity, 1, '上限 1');
near(core.applyPatch(c2, { ui: { opacity: 0 } }).ui.opacity, 0.2, '下限 0.2');
near(core.applyPatch(c2, { ui: { opacity: 'abc' } }).ui.opacity, 0.92, '非法值回退默认');

// 补丁里的 window / theme.current 会被忽略
let c3 = core.applyPatch(c2, { window: { x: 9999, y: 9999 }, theme: { current: 'sakura' } });
assert.deepStrictEqual([c3.window.x, c3.window.y], [100, 200], 'window 以主进程为准');
assert.strictEqual(c3.theme.current, 'night-gold', '补丁不能直接切皮肤');
near(c3.ui.opacity, 0.5, '透明度不变');

// 心愿单整体替换 + 校验
c3 = core.applyPatch(c2, { wishes: [{ id: 'b', emoji: '', name: '', price: -5 }, 'junk'] });
assert.strictEqual(c3.wishes.length, 2);
assert.strictEqual(c3.wishes[0].name, '小目标', '空名字回退');
assert.strictEqual(c3.wishes[0].emoji, '🎯', '空图标回退');
near(c3.wishes[0].price, 0.01, '价格下限');
assert.ok(c3.wishes[1].id, '脏条目也会被补全');
assert.strictEqual(core.applyPatch(c2, { wishes: new Array(30).fill({ name: 'x', price: 1 }) }).wishes.length, 12, '最多 12 个');

// 发薪日可清空
assert.strictEqual(core.applyPatch(c2, { salary: { payday: null } }).salary.payday, null);
assert.strictEqual(core.applyPatch(c2, { salary: { payday: 40 } }).salary.payday, null, '非法发薪日置空');

/* ---------- 换肤：每个皮肤记住自己的透明度 ---------- */
let t1 = core.switchTheme(c2, 'sakura');             // 暗夜金(0.5) → 樱花粉
assert.strictEqual(t1.theme.current, 'sakura');
near(t1.ui.opacity, 0.93, '切到樱花粉：带出它的默认透明度');
near(t1.theme.opacityMap['night-gold'], 0.5, '暗夜金仍记着 0.5');
invariant(t1, '切到樱花粉');
assert.strictEqual(c2.theme.current, 'night-gold', 'switchTheme 不修改入参');

t1 = core.applyPatch(t1, { ui: { opacity: 0.7 } });  // 在樱花粉下调到 0.7
near(t1.theme.opacityMap.sakura, 0.7, '樱花粉记住 0.7');
near(t1.theme.opacityMap['night-gold'], 0.5, '暗夜金不受影响');

let t2 = core.switchTheme(t1, 'cream');              // → 奶油白
near(t2.ui.opacity, 0.97, '奶油白默认透明度');
t2 = core.switchTheme(t2, 'night-gold');             // → 回暗夜金
near(t2.ui.opacity, 0.5, '切回暗夜金：恢复 0.5');
t2 = core.switchTheme(t2, 'sakura');                 // → 回樱花粉
near(t2.ui.opacity, 0.7, '切回樱花粉：恢复 0.7');
invariant(t2, '来回切换');

// 同一皮肤重复切换是幂等的
near(core.switchTheme(t2, 'sakura').ui.opacity, 0.7, '重复切换同一皮肤不变');

// 未知皮肤 id
assert.strictEqual(core.switchTheme(t2, 'no-such-skin'), null, '未知皮肤返回 null');
assert.strictEqual(core.switchTheme(t2, undefined), null);

/* ---------- 自定义皮肤 ---------- */
let u = core.applyPatch(t2, { theme: { custom: { accent1: '#ABCDEF' } } });
assert.strictEqual(u.theme.custom.accent1, '#abcdef', '自定义色规范化为小写');
assert.strictEqual(u.theme.custom.accent2, Themes.CUSTOM_FALLBACK.accent2, '未提到的自定义色保持不变');
assert.strictEqual(u.theme.current, 'sakura', '改配色本身不切皮肤');

u = core.applyPatch(u, { theme: { custom: { bg: 'not-a-color' } } });
assert.strictEqual(u.theme.custom.bg, Themes.CUSTOM_FALLBACK.bg, '非法颜色回退');

u = core.switchTheme(u, 'custom');
assert.strictEqual(u.theme.current, 'custom');
invariant(u, '切到自定义');
u = core.applyPatch(u, { ui: { opacity: 0.33 } });
near(u.theme.opacityMap.custom, 0.33, '自定义皮肤也记住自己的透明度');
u = core.switchTheme(core.switchTheme(u, 'mint'), 'custom');
near(u.ui.opacity, 0.33, '切回自定义：恢复 0.33');

/* ---------- 自定义皮肤背景图 ---------- */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let bi = core.applyPatch(u, { theme: { custom: { image: TINY_PNG } } });
assert.strictEqual(bi.theme.custom.image, TINY_PNG, '合法背景图保留');
assert.strictEqual(bi.theme.custom.accent1, u.theme.custom.accent1, '背景图不影响配色');
assert.strictEqual(bi.theme.current, 'custom', '传图不额外切皮肤');
bi = core.applyPatch(bi, { theme: { custom: { image: 'javascript:alert(1)' } } });
assert.strictEqual(bi.theme.custom.image, '', '非法背景图被清掉');
bi = core.applyPatch(bi, { theme: { custom: { image: TINY_PNG } } });
assert.strictEqual(core.initConfig(JSON.parse(JSON.stringify(bi))).theme.custom.image, TINY_PNG, '背景图存取往返');

/* ---------- 序列化往返（模拟存盘再读取） ---------- */
const reloaded = core.initConfig(JSON.parse(JSON.stringify(u)));
assert.deepStrictEqual(reloaded, u, '存盘再读取后配置完全一致');

console.log('✓ config.test.js 全部通过');
