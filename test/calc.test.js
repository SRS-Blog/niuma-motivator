'use strict';
const assert = require('assert');
const Calc = require('../renderer/calc.js');

const cfg = {
  salary: {
    monthly: 12000,
    workDays: [1, 2, 3, 4, 5],
    workStart: '09:00',
    workEnd: '18:00',
    lunchEnabled: true,
    lunchStart: '12:00',
    lunchEnd: '13:00',
    payday: 15,
  },
};

const daysPerMonth = 5 * 52 / 12;
const daily = 12000 / daysPerMonth;
const workLen = 8 * 3600;
const rate = daily / workLen;
const EPS = 1e-6;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} != ${b}`);

// 2026-11-11 是周三，2026-11-14 是周六
const wed = (h, m = 0, s = 0) => new Date(2026, 10, 11, h, m, s);
const sat = (h, m = 0, s = 0) => new Date(2026, 10, 14, h, m, s);

assert.strictEqual(new Date(2026, 10, 11).getDay(), 3, '前置：2026-11-11 应为周三');
assert.strictEqual(new Date(2026, 10, 14).getDay(), 6, '前置：2026-11-14 应为周六');

// 1. 上班前
let d = Calc.computeDay(cfg, wed(8));
near(d.earned, 0, '上班前收入为 0');
assert.strictEqual(d.beforeWork, true);
near(d.toStart, 3600, '距开工 1 小时');
near(d.pct, 0, '进度 0');

// 2. 上午 10 点（工作 1 小时）
d = Calc.computeDay(cfg, wed(10));
near(d.rate, rate, '每秒速率');
near(d.earned, rate * 3600, '10 点已赚 1 小时');
near(d.pct, 3600 / workLen, '进度 12.5%');

// 3. 午休中 12:30（只工作了 3 小时）
d = Calc.computeDay(cfg, wed(12, 30));
assert.strictEqual(d.onLunch, true);
near(d.worked, 3 * 3600, '午休中已工作 3 小时');
near(d.earned, rate * 3 * 3600, '午休不计薪');

// 4. 下午 13:30（工作了 3.5 小时）
d = Calc.computeDay(cfg, wed(13, 30));
near(d.worked, 3.5 * 3600, '下午 13:30 已工作 3.5 小时');
assert.strictEqual(d.onLunch, false);

// 5. 下班后 19:00（封顶为整日薪）
d = Calc.computeDay(cfg, wed(19));
assert.strictEqual(d.afterWork, true);
near(d.earned, daily, '下班后封顶为日薪');
near(d.pct, 1, '进度 100%');

// 6. 周六不算
d = Calc.computeDay(cfg, sat(10));
assert.strictEqual(d.working, false);
near(d.earned, 0, '周末收入 0');
assert.strictEqual(d.toStart, null);

// 7. 发薪日
d = Calc.computeDay(cfg, wed(10));
assert.strictEqual(d.paydayIn, 4, '11 月 11 日距 15 号发薪还有 4 天');
d = Calc.computeDay(cfg, new Date(2026, 10, 15, 10));
assert.strictEqual(d.paydayIn, 0, '当天发薪 paydayIn = 0');

// 8. 午休关闭
const cfgNoLunch = JSON.parse(JSON.stringify(cfg));
cfgNoLunch.salary.lunchEnabled = false;
d = Calc.computeDay(cfgNoLunch, wed(12, 30));
near(d.worked, 3.5 * 3600, '无午休时 12:30 已工作 3.5 小时');

// 9. 非法时间
const cfgBad = JSON.parse(JSON.stringify(cfg));
cfgBad.salary.workEnd = '08:00';
d = Calc.computeDay(cfgBad, wed(10));
assert.strictEqual(d.valid, false, '下班早于上班应视为无效');
near(d.earned, 0, '无效配置收入 0');

// 10. 月薪为 0
const cfgZero = JSON.parse(JSON.stringify(cfg));
cfgZero.salary.monthly = 0;
d = Calc.computeDay(cfgZero, wed(10));
assert.strictEqual(d.valid, false, '月薪 0 应视为无效');

// 格式化
assert.strictEqual(Calc.decimalsFor(2), 2);
assert.strictEqual(Calc.decimalsFor(0.02), 3);
assert.strictEqual(Calc.decimalsFor(0.002), 4);
assert.strictEqual(Calc.fmtMoney(123.4567, 0.016), '123.457');
assert.strictEqual(Calc.fmtClock(2 * 3600 + 13 * 60 + 5), '2:13:05');
assert.strictEqual(Calc.fmtClock(13 * 60 + 5), '13:05');
assert.strictEqual(Calc.fmtHM(2 * 3600 + 13 * 60), '2 小时 13 分');
assert.strictEqual(Calc.fmtHM(45 * 60), '45 分钟');
assert.strictEqual(Calc.hhmmToSec('09:00'), 32400);
assert.strictEqual(Calc.hhmmToSec('25:00'), null);

console.log('✓ calc.test.js 全部通过（19 项断言）');
