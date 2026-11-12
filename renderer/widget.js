'use strict';
/* 牛马鼓励器 —— 悬浮窗逻辑 */
(() => {
  const $ = (id) => document.getElementById(id);

  const QUOTE_MS = 5000; // 每 5 秒换一句
  const QUOTES = [
    (c, d) => (d.rate > 0 ? `你正以每秒 ¥${Calc.fmtRate(d.rate)} 的速度变富` : '填好工资，钱就开始跳了'),
    () => '你不是牛马，你是行走的印钞机',
    (c, d) => `摸鱼 1 分钟 = 少赚 ¥${(d.rate * 60).toFixed(2)}，但快乐无价`,
    () => '每一秒都算数，每一分都归你',
    (c, d) => `今天的第 ${Math.floor(d.earned) + 1} 块钱正在路上`,
    () => '上班是为了更好地生活，不是反过来',
    (c, d) => `今日进度 ${(d.pct * 100).toFixed(1)}%，牛的，马的`,
    () => '钱包在长大，头发还在，稳赚不赔',
    (c, d) => (d.paydayIn === null ? '面包会有的，工资也会有的'
      : d.paydayIn === 0 ? '今天发薪，牛马过年 🎉'
      : `再有 ${d.paydayIn} 天，工资就到账了`),
    () => '世界很大，先把今天的钱赚到手',
    (c) => (c.wishes && c.wishes[0] ? `距离「${c.wishes[0].name}」又近了一点点` : '给自己定个小目标吧'),
    () => '喝口水，伸个懒腰，钱还在涨',
    () => '别急，慢慢来，比较快',
    (c, d) => (d.afterWork ? '今天辛苦了，剩下的交给明天' : '稳住，我们能赢'),
  ];

  const CUSTOM_DOT_BG = 'conic-gradient(from 0deg, #ff6b6b, #ffd76a, #6ee7b7, #7cc7ff, #c4b5fd, #ff6b6b)';

  const els = {};
  let cfg = null;
  let wishRefs = [];
  let qIdx = -1;
  let qOffset = 0;
  let lastInt = null;
  let popTimer = null;
  let lastDateText = '';
  let opTimer = null;
  let salaryEditing = false;

  function pop() {
    els.amountBox.classList.remove('pop');
    void els.amountBox.offsetWidth; // 重置动画
    els.amountBox.classList.add('pop');
    clearTimeout(popTimer);
    popTimer = setTimeout(() => els.amountBox.classList.remove('pop'), 520);
  }

  /* ---------- 透明度 ---------- */

  let opLocalAt = 0;      // 最近一次本地调节的时间（期间忽略广播里的旧值，避免回跳）
  let opPending = false;

  function flushOpacity() {
    clearTimeout(opTimer);
    if (!opPending) return Promise.resolve();
    opPending = false;
    return window.niuma.updateConfig({ ui: { opacity: cfg.ui.opacity } }).catch(() => {});
  }

  function setOpacityLocal(v) {
    const next = Math.round(Math.min(1, Math.max(0.2, v)) * 100) / 100;
    if (next === cfg.ui.opacity) return;
    cfg.ui.opacity = next;
    document.documentElement.style.opacity = String(next);
    opLocalAt = Date.now();
    opPending = true;
    clearTimeout(opTimer);
    opTimer = setTimeout(flushOpacity, 200);
  }

  function syncOpSlider() {
    if (document.activeElement === els.opSlider) return;
    els.opSlider.value = String(Math.round(cfg.ui.opacity * 100));
  }

  /* ---------- 月薪：点击就地编辑 ---------- */

  function renderSalaryLine() {
    if (salaryEditing) return;
    const m = Number(cfg.salary.monthly) || 0;
    els.salaryLine.textContent = `月薪 ¥${m.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  }

  function startSalaryEdit() {
    if (salaryEditing) return;
    salaryEditing = true;
    const cur = Number(cfg.salary.monthly) || 0;
    els.salaryLine.textContent = '';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'salary-input';
    inp.min = '0';
    inp.step = '100';
    inp.value = String(cur);
    els.salaryLine.appendChild(inp);
    inp.focus();
    inp.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      salaryEditing = false;
      if (save) {
        const v = Math.max(0, Math.min(1e7, Number(inp.value) || 0));
        if (v !== cur) {
          cfg.salary.monthly = v;
          window.niuma.updateConfig({ salary: { monthly: v } });
        }
      }
      renderSalaryLine();
      tick();
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
  }

  /* ---------- 皮肤 ---------- */

  function buildDots() {
    els.themeDots.textContent = '';
    const all = Themes.THEMES.concat([{ id: 'custom', name: '自定义（设置里可调配色、传背景图）' }]);
    for (const t of all) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'dot';
      d.dataset.id = t.id;
      d.title = t.name;
      d.style.background = t.id === 'custom'
        ? CUSTOM_DOT_BG
        : `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`;
      // 先把未落盘的透明度存进当前皮肤，再切换（新皮肤会带出它自己记住的透明度）
      d.addEventListener('click', () => {
        flushOpacity().then(() => {
          opLocalAt = 0;
          return window.niuma.setTheme(t.id);
        });
      });
      els.themeDots.appendChild(d);
    }
  }

  function applySkin() {
    const theme = Themes.getThemeById(cfg.theme.current, cfg.theme.custom);
    Themes.applyTheme(document.documentElement, theme);
    document.documentElement.style.opacity = String(cfg.ui.opacity);

    // 背景图（自定义皮肤上传的图片）
    const img = theme.image || '';
    els.card.classList.toggle('has-img', !!img);
    if (img) els.card.style.setProperty('--bg-image', `url("${img}")`);
    else els.card.style.removeProperty('--bg-image');

    els.themeDots.querySelectorAll('.dot').forEach((d) => {
      d.classList.toggle('active', d.dataset.id === cfg.theme.current);
    });
    // 自定义色点：有背景图就显示图片缩略
    const cd = els.themeDots.querySelector('.dot[data-id="custom"]');
    if (cd) cd.style.background = img ? `url("${img}") center / cover` : CUSTOM_DOT_BG;

    syncOpSlider();
  }

  /* ---------- 配置变化时重建的静态部分 ---------- */

  function buildStatic() {
    applySkin();
    els.ghostBadge.hidden = !cfg.ui.clickThrough;
    // 穿透图标跟随状态：开启才保留斜杠，取消时必须摘掉
    els.btnGhost.classList.toggle('on', !!cfg.ui.clickThrough);
    renderSalaryLine();

    wishRefs = [];
    els.wishes.textContent = '';
    const wishes = Array.isArray(cfg.wishes) ? cfg.wishes : [];
    if (!wishes.length) {
      const empty = document.createElement('div');
      empty.className = 'wish-empty';
      empty.append('还没有小目标，');
      const b = document.createElement('b');
      b.textContent = '点这里添加 ＋';
      empty.append(b);
      empty.addEventListener('click', () => window.niuma.openSettings());
      els.wishes.appendChild(empty);
      return;
    }
    for (const w of wishes) {
      const row = document.createElement('div');
      row.className = 'wish';

      const wrow = document.createElement('div');
      wrow.className = 'wrow';
      const emoji = document.createElement('span');
      emoji.className = 'wemoji';
      emoji.textContent = w.emoji || '🎯';
      const name = document.createElement('span');
      name.className = 'wname';
      name.textContent = w.name || '小目标';
      name.title = `${w.name || '小目标'} · ¥${w.price}`;
      const status = document.createElement('span');
      status.className = 'wstatus';
      wrow.append(emoji, name, status);

      const track = document.createElement('div');
      track.className = 'wtrack';
      const bar = document.createElement('div');
      bar.className = 'wbar';
      track.appendChild(bar);

      row.append(wrow, track);
      els.wishes.appendChild(row);
      wishRefs.push({ price: Number(w.price) || 0, row, status, bar });
    }
  }

  function renderQuote(d, force) {
    const n = QUOTES.length;
    const idx = (((Math.floor(Date.now() / QUOTE_MS) + qOffset) % n) + n) % n;
    if (!force && idx === qIdx) return;
    qIdx = idx;
    let text;
    try { text = QUOTES[idx](cfg, d); } catch (e) { text = '钱在涨，心别慌'; }
    els.quote.textContent = `“${text}”`;
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function tick() {
    if (!cfg) return;
    const now = new Date();
    const d = Calc.computeDay(cfg, now);

    // 日期 + 时间（xx月xx日 周x 13:00:00，每秒刷新）
    const p2 = (n) => String(n).padStart(2, '0');
    const dt = `${now.getMonth() + 1}月${now.getDate()}日 周${'日一二三四五六'[now.getDay()]} `
      + `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
    if (dt !== lastDateText) { lastDateText = dt; els.date.textContent = dt; }

    // 金额
    setText(els.amount, Calc.fmtMoney(d.earned, d.rate));
    const iv = Math.floor(d.earned);
    if (lastInt !== null && iv > lastInt && d.working && !d.afterWork) pop();
    lastInt = iv;

    setText(els.rateLine, d.rate > 0
      ? `每秒 +¥${Calc.fmtRate(d.rate)} · 时薪 ¥${(d.rate * 3600).toFixed(2)}`
      : '点左边填一下月薪吧');

    // 今日进度
    els.bar.style.width = (d.pct * 100).toFixed(2) + '%';
    els.bar.classList.toggle('full', d.pct >= 1);

    // 状态
    let status;
    if (!d.valid) status = '⚠ 请到设置里完善工资 / 工作时间';
    else if (!d.working) status = '今天休息 🌴';
    else if (d.onLunch) status = '午休充电中 😴';
    else if (d.beforeWork) status = `距开工 ${Calc.fmtHM(d.toStart)}`;
    else if (d.afterWork) status = '已收工，今日圆满 🎉';
    else status = `距下班 ${Calc.fmtClock(d.workLen - d.worked)}`;
    setText(els.chipStatus, status);
    els.chipStatus.classList.toggle('warn', !d.valid);

    let pay = '';
    if (d.valid && d.paydayIn !== null) pay = d.paydayIn === 0 ? '今天发薪 🎉' : `距发薪 ${d.paydayIn} 天`;
    setText(els.chipPayday, pay);
    els.chipPayday.hidden = !pay;

    const pctText = d.valid && d.working ? `今日进度 ${Math.floor(d.pct * 100)}%` : '';
    setText(els.chipPct, pctText);
    els.chipPct.hidden = !pctText;

    // 小目标
    for (const w of wishRefs) {
      if (!(w.price > 0)) continue;
      const rem = w.price - d.earned;
      const done = rem <= 0;
      w.row.classList.toggle('done', done);
      w.bar.style.width = (Math.min(1, d.earned / w.price) * 100).toFixed(1) + '%';
      let st;
      if (done) {
        st = '今天就能拿下 🎉';
      } else {
        const days = d.daily > 0 ? Math.ceil(rem / d.daily) : 0;
        const remText = rem.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        st = `还差 ¥${remText}` + (days > 0 ? ` · 约 ${days} 天` : '');
      }
      setText(w.status, st);
    }

    renderQuote(d, false);
  }

  function reportHeight() {
    window.niuma.setWidgetHeight(Math.ceil(document.body.scrollHeight) + 1);
  }

  function bind() {
    $('btnSettings').addEventListener('click', () => window.niuma.openSettings());
    $('btnGhost').addEventListener('click', () => window.niuma.toggleClickThrough());
    $('btnQuit').addEventListener('click', () => window.niuma.quit());
    $('wishEdit').addEventListener('click', () => window.niuma.openSettings());
    els.salaryLine.addEventListener('click', startSalaryEdit);

    els.quote.addEventListener('click', () => {
      qOffset += 1;
      renderQuote(Calc.computeDay(cfg, new Date()), true);
    });

    // 透明度滑杆
    els.opSlider.addEventListener('input', () => {
      setOpacityLocal(Number(els.opSlider.value) / 100);
    });

    // Ctrl / Alt + 滚轮：快速调节透明度
    window.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.altKey)) return;
      e.preventDefault();
      setOpacityLocal(cfg.ui.opacity - e.deltaY * 0.0005);
      els.opSlider.value = String(Math.round(cfg.ui.opacity * 100));
    }, { passive: false });
  }

  async function init() {
    Object.assign(els, {
      card: $('card'),
      amountBox: $('amountBox'),
      amount: $('amount'),
      date: $('dateLabel'),
      salaryLine: $('salaryLine'),
      rateLine: $('rateLine'),
      bar: $('bar'),
      chipStatus: $('chipStatus'),
      chipPayday: $('chipPayday'),
      chipPct: $('chipPct'),
      wishes: $('wishes'),
      quote: $('quote'),
      ghostBadge: $('ghostBadge'),
      btnGhost: $('btnGhost'),
      themeDots: $('themeDots'),
      opSlider: $('opSlider'),
    });

    cfg = await window.niuma.getConfig();
    buildDots();
    bind();
    buildStatic();
    tick();

    new ResizeObserver(() => reportHeight()).observe(document.body);
    reportHeight();

    window.niuma.onConfig((next) => {
      // 正在本地调透明度时以本地值为准，避免被自己稍早的保存广播拉回去
      if (Date.now() - opLocalAt < 600) next.ui.opacity = cfg.ui.opacity;
      cfg = next;
      buildStatic();
      tick();
      reportHeight();
    });

    setInterval(tick, 100);
  }

  init().catch((e) => console.error('widget init failed:', e));
})();
