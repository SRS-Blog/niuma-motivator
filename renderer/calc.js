'use strict';
// 牛马鼓励器 —— 核心计算（纯函数，渲染层与单元测试共用）
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function hhmmToSec(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t == null ? '' : t));
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 3600 + mi * 60;
  }

  // 计算「今天」的实时收入情况
  function computeDay(cfg, now) {
    now = now || new Date();
    const s = (cfg && cfg.salary) || {};
    const workDays = Array.isArray(s.workDays) && s.workDays.length ? s.workDays : [1, 2, 3, 4, 5];
    const dow = now.getDay() === 0 ? 7 : now.getDay(); // 1=周一 ... 7=周日
    const working = workDays.indexOf(dow) !== -1;

    const start = hhmmToSec(s.workStart);
    const end = hhmmToSec(s.workEnd);
    const lunchS0 = hhmmToSec(s.lunchStart);
    const lunchE0 = hhmmToSec(s.lunchEnd);
    const lunchOn = !!s.lunchEnabled && lunchS0 !== null && lunchE0 !== null && lunchE0 > lunchS0;
    const lunchS = lunchOn ? lunchS0 : 0;
    const lunchE = lunchOn ? lunchE0 : 0;

    const monthly = Number(s.monthly) > 0 ? Number(s.monthly) : 0;
    const timeOk = start !== null && end !== null && end > start;
    const lunchOverlap = timeOk && lunchOn ? Math.max(0, Math.min(end, lunchE) - Math.max(start, lunchS)) : 0;
    const workLen = timeOk ? Math.max(0, (end - start) - lunchOverlap) : 0;
    const valid = timeOk && workLen > 0 && monthly > 0;

    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
    const daysPerMonth = Math.max(1, workDays.length) * 52 / 12;
    const daily = valid ? monthly / daysPerMonth : 0;
    const rate = valid ? daily / workLen : 0;

    let worked = 0;
    if (valid && working) {
      const t = Math.min(nowSec, end);
      if (t > start) {
        worked = t - start;
        if (lunchOn) worked -= Math.max(0, Math.min(t, lunchE) - Math.max(start, lunchS));
        worked = Math.max(0, Math.min(worked, workLen));
      }
    }
    const earned = Math.max(0, rate * worked);
    const pct = daily > 0 ? Math.min(1, earned / daily) : 0;

    const beforeWork = valid && working && nowSec < start;
    const afterWork = valid && working && nowSec >= end;
    const onLunch = valid && working && lunchOn && nowSec >= lunchS && nowSec < lunchE && lunchS < end && lunchE > start;
    const toStart = beforeWork ? start - nowSec : null;

    // 距发薪日
    let paydayIn = null;
    if (s.payday !== null && s.payday !== undefined && Number.isFinite(Number(s.payday))) {
      const pd = Math.round(Number(s.payday));
      if (pd >= 1 && pd <= 31) {
        const y = now.getFullYear(), m = now.getMonth();
        const mk = (yy, mm) => new Date(yy, mm, Math.min(pd, new Date(yy, mm + 1, 0).getDate()));
        const today0 = new Date(y, m, now.getDate());
        let p = mk(y, m);
        if (p.getTime() < today0.getTime()) p = mk(y, m + 1);
        paydayIn = Math.round((p.getTime() - today0.getTime()) / 86400000);
      }
    }

    return {
      valid, working, beforeWork, onLunch, afterWork,
      rate, daily, workLen, worked, earned, pct, toStart, paydayIn,
      daysPerMonth,
    };
  }

  function decimalsFor(rate) {
    return rate >= 1 ? 2 : rate >= 0.01 ? 3 : 4;
  }

  function fmtMoney(v, rate) {
    const d = decimalsFor(rate);
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtRate(r) {
    return r >= 1 ? r.toFixed(2) : r >= 0.01 ? r.toFixed(3) : r.toFixed(4);
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
      : m + ':' + String(s).padStart(2, '0');
  }

  function fmtHM(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (h && m) return h + ' 小时 ' + m + ' 分';
    if (h) return h + ' 小时';
    return m + ' 分钟';
  }

  return { hhmmToSec, computeDay, decimalsFor, fmtMoney, fmtRate, fmtClock, fmtHM };
});
