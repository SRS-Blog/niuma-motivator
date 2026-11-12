'use strict';
/* 牛马鼓励器 —— 设置窗口逻辑
 *
 * 保存策略：只上传「改动过的字段」（增量补丁），而不是整份配置。
 * 这样悬浮窗 / 托盘 / 快捷键同时改了别的字段也不会互相覆盖；
 * 尚未保存的本地改动（dirty）在收到主进程回传时始终优先。
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const WD_LABEL = ['一', '二', '三', '四', '五', '六', '日'];
  const CUSTOM_SWATCH_BG = 'conic-gradient(from 0deg, #ff6b6b, #ffd76a, #6ee7b7, #7cc7ff, #c4b5fd, #ff6b6b)';
  // 小目标备选图标
  const EMOJIS = [
    '🎯', '🎁', '☕', '🧋', '🍰', '🍜', '🍣', '🎮',
    '📱', '💻', '🎧', '⌚', '📷', '👟', '👜', '💄',
    '🧴', '👗', '🕶️', '🚗', '🏍️', '🏠', '🛋️', '✈️',
    '🏖️', '🏔️', '🎫', '🐱', '🐶', '🌸', '📚', '🎓',
    '💰', '🧸',
  ];

  let cfg = null;
  let dirty = null;      // 待保存的增量补丁
  let pushTimer = null;
  let switching = null;  // 正在进行中的皮肤切换

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  // 返回新对象：base 叠加 patch（数组整体替换）
  function mergeInto(base, patch) {
    const out = { ...base };
    for (const k of Object.keys(patch)) {
      out[k] = isObj(patch[k]) && isObj(base[k]) ? mergeInto(base[k], patch[k]) : patch[k];
    }
    return out;
  }

  // 接收主进程回传的配置；未保存的本地改动优先
  function adopt(next) {
    cfg = dirty ? mergeInto(next, dirty) : next;
  }

  // 记录一处改动：同时写入本地 cfg 和待保存补丁
  function mark(path, value) {
    let o = cfg;
    let d = (dirty = dirty || {});
    for (let i = 0; i < path.length - 1; i++) {
      o = o[path[i]];
      d = d[path[i]] = d[path[i]] || {};
    }
    const k = path[path.length - 1];
    o[k] = value;
    d[k] = value;
    push();
  }

  function refresh() {
    syncInputs();
    renderDerived();
    renderTheme();
    renderImage();
  }

  function pushNow() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (!dirty) return Promise.resolve();
    const patch = clone(dirty);
    dirty = null;
    return window.niuma.updateConfig(patch)
      .then((next) => {
        adopt(next);
        refresh();
        flashSaved();
      })
      .catch((e) => console.error('保存失败:', e));
  }

  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 260);
  }

  function flashSaved() {
    const el = $('saveHint');
    el.textContent = '已保存 ✓';
    el.classList.add('on');
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(() => {
      el.textContent = '改动会自动保存';
      el.classList.remove('on');
    }, 1200);
  }

  /* ---------- 小目标图标点选 ---------- */

  let emojiPop = null;

  function closeEmojiPop() {
    if (emojiPop) { emojiPop.remove(); emojiPop = null; }
  }

  function openEmojiPop(anchor, current, onPick) {
    closeEmojiPop();
    emojiPop = document.createElement('div');
    emojiPop.className = 'emoji-pop';
    const list = current && !EMOJIS.includes(current) ? [current].concat(EMOJIS) : EMOJIS;
    for (const e of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.title = e;
      if (e === current) b.classList.add('active');
      b.addEventListener('click', () => {
        closeEmojiPop();
        onPick(e);
      });
      emojiPop.appendChild(b);
    }
    document.body.appendChild(emojiPop);
    // 贴着按钮弹出，越界时翻到上方
    const r = anchor.getBoundingClientRect();
    const w = emojiPop.offsetWidth;
    const h = emojiPop.offsetHeight;
    let x = Math.min(r.left, window.innerWidth - w - 8);
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    emojiPop.style.left = Math.max(8, x) + 'px';
    emojiPop.style.top = y + 'px';
  }

  /* ---------- 渲染 ---------- */

  function renderWorkdays() {
    document.querySelectorAll('#wdGroup .wd').forEach((b) => {
      b.classList.toggle('on', cfg.salary.workDays.includes(Number(b.dataset.day)));
    });
  }

  function renderWishes() {
    const box = $('wishList');
    box.textContent = '';
    if (!cfg.wishes.length) {
      const d = document.createElement('div');
      d.className = 'wish-empty-s';
      d.textContent = '还没有小目标，点下面按钮添加一个吧';
      box.appendChild(d);
      return;
    }
    for (const w of cfg.wishes) {
      const row = document.createElement('div');
      row.className = 'wish-row';

      const emoji = document.createElement('button');
      emoji.type = 'button';
      emoji.className = 'in-emoji';
      emoji.textContent = w.emoji || '🎯';
      emoji.title = '点击更换图标';

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'in-name';
      name.maxLength = 24;
      name.placeholder = '想买什么';
      name.value = w.name;

      const priceWrap = document.createElement('div');
      priceWrap.className = 'price-wrap';
      const yen = document.createElement('span');
      yen.textContent = '¥';
      const price = document.createElement('input');
      price.className = 'in-price';
      price.type = 'number';
      price.min = '0';
      price.step = '1';
      price.value = String(w.price);
      priceWrap.append(yen, price);

      const del = document.createElement('button');
      del.className = 'icon-btn del';
      del.title = '删除';
      del.textContent = '✕';

      const upd = () => {
        const next = cfg.wishes.map((x) => (x.id !== w.id ? x : {
          id: x.id,
          emoji: emoji.textContent.trim() || '🎯',
          name: name.value.trim() || '小目标',
          price: Math.max(0, Number(price.value) || 0),
        }));
        mark(['wishes'], next);
      };
      emoji.addEventListener('click', () => {
        openEmojiPop(emoji, emoji.textContent.trim(), (pick) => {
          emoji.textContent = pick;
          upd();
        });
      });
      name.addEventListener('input', upd);
      price.addEventListener('input', upd);

      del.addEventListener('click', () => {
        mark(['wishes'], cfg.wishes.filter((x) => x.id !== w.id));
        renderWishes();
      });

      row.append(emoji, name, priceWrap, del);
      box.appendChild(row);
    }
  }

  function buildThemeGrid() {
    const grid = $('themeGrid');
    grid.textContent = '';
    const all = Themes.THEMES.concat([{ id: 'custom', name: '自定义' }]);
    for (const t of all) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tcard';
      b.dataset.id = t.id;
      const sw = document.createElement('span');
      sw.className = 'tswatch';
      sw.style.background = t.id === 'custom'
        ? CUSTOM_SWATCH_BG
        : `linear-gradient(135deg, ${t.accent1}, ${t.accent2})`;
      const nm = document.createElement('span');
      nm.textContent = t.name;
      b.append(sw, nm);
      b.addEventListener('click', () => switchTheme(t.id));
      grid.appendChild(b);
    }
  }

  // 设置页整体跟随当前皮肤（背景 / 文字 / 强调色一起换）
  function renderTheme() {
    const theme = Themes.getThemeById(cfg.theme.current, cfg.theme.custom);
    Themes.applyTheme(document.documentElement, theme);
    document.querySelectorAll('#themeGrid .tcard').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === cfg.theme.current);
    });
    // 自定义色点：有背景图就用缩略图
    const sw = document.querySelector('#themeGrid .tcard[data-id="custom"] .tswatch');
    if (sw) {
      const img = (cfg.theme.custom && cfg.theme.custom.image) || '';
      sw.style.background = img ? `url("${img}") center / cover` : CUSTOM_SWATCH_BG;
    }
  }

  // 切换皮肤：先把未保存的改动（含当前皮肤的透明度）落盘，再切换
  function switchTheme(id) {
    return pushNow()
      .then(() => window.niuma.setTheme(id))
      .then((next) => {
        adopt(next);
        refresh();
        flashSaved();
      })
      .catch((e) => console.error('切换皮肤失败:', e));
  }

  async function setCustomProp(prop, value) {
    if (cfg.theme.current !== 'custom') {
      // 调整配色 / 上传背景图即切到「自定义」皮肤（拖动取色器会连续触发，这里只切一次）
      switching = switching || switchTheme('custom').finally(() => { switching = null; });
      await switching;
    }
    mark(['theme', 'custom', prop], value);
    renderTheme();
    renderImage();
  }

  /* ---------- 背景图：压缩到 1280px 以内再存进配置 ---------- */

  const IMAGE_MAX_LEN = 4500000; // 超过这个长度（约 3.3MB 图片）就拒绝

  async function fileToSkinImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    // PNG 先保留透明通道；太大再退回 JPEG
    let url = file.type === 'image/png' ? cv.toDataURL('image/png') : '';
    if (!url || url.length > 900000) url = cv.toDataURL('image/jpeg', 0.85);
    return url;
  }

  function imgHint(msg, warn) {
    const el = $('imgHint');
    if (msg) {
      el.textContent = msg;
      el.classList.toggle('warn', !!warn);
    } else {
      el.classList.remove('warn');
      el.innerHTML = '背景图会作为「自定义」皮肤的底图（自动压缩到 1280px）· 每个皮肤会分别记住自己的不透明度<br>'
        + '调整配色或上传图片会自动切到「自定义」皮肤 · 背景选浅色时文字会自动变成深色';
    }
    clearTimeout(imgHint.t);
    if (msg) imgHint.t = setTimeout(() => imgHint(null), 4000);
  }

  function renderImage() {
    const img = (cfg.theme.custom && cfg.theme.custom.image) || '';
    const th = $('imgThumb');
    th.hidden = !img;
    th.style.backgroundImage = img ? `url("${img}")` : '';
    $('btnClearImg').hidden = !img;
  }

  function syncInputs() {
    const S = cfg.salary;
    const C = cfg.theme.custom;
    const set = (id, val) => {
      const el = $(id);
      if (document.activeElement === el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val;
    };
    set('monthly', S.monthly);
    set('workStart', S.workStart);
    set('workEnd', S.workEnd);
    set('lunchStart', S.lunchStart);
    set('lunchEnd', S.lunchEnd);
    set('lunchEnabled', S.lunchEnabled);
    set('payday', S.payday === null || S.payday === undefined ? '' : String(S.payday));
    set('cAccent1', C.accent1);
    set('cAccent2', C.accent2);
    set('cBg', C.bg);
    set('opacity', String(Math.round(cfg.ui.opacity * 100)));
    set('clickThrough', cfg.ui.clickThrough);
    set('alwaysOnTop', cfg.ui.alwaysOnTop);
    set('launchAtLogin', cfg.behavior.launchAtLogin);
    $('opacityVal').textContent = Math.round(cfg.ui.opacity * 100) + '%';
    renderWorkdays();
  }

  function renderDerived() {
    const d = Calc.computeDay(cfg, new Date());
    const days = Math.max(1, cfg.salary.workDays.length) * 52 / 12;
    $('daysPerMonth').textContent = `≈ ${days.toFixed(1)} 天`;
    $('sSec').textContent = '¥' + Calc.fmtRate(d.rate);
    $('sHour').textContent = '¥' + (d.rate * 3600).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    $('sDay').textContent = '¥' + d.daily.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

    const hint = $('workHint');
    const st = Calc.hhmmToSec(cfg.salary.workStart);
    const en = Calc.hhmmToSec(cfg.salary.workEnd);
    if (st === null || en === null || en <= st) {
      hint.textContent = '⚠ 下班时间需要晚于上班时间';
      hint.className = 'hint warn';
    } else if (d.workLen <= 0) {
      hint.textContent = '⚠ 午休不能覆盖全部工作时间';
      hint.className = 'hint warn';
    } else {
      hint.textContent = `每天计薪 ${(d.workLen / 3600).toFixed(1)} 小时 · 所有数据只保存在本机`;
      hint.className = 'hint';
    }
  }

  /* ---------- 绑定 ---------- */

  function bind() {
    // 图标弹层：点外面 / Esc / 滚动时收起
    document.addEventListener('pointerdown', (e) => {
      if (emojiPop && !emojiPop.contains(e.target) && !e.target.closest('.in-emoji')) closeEmojiPop();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEmojiPop();
    });
    document.querySelector('.s-body').addEventListener('scroll', closeEmojiPop);

    $('monthly').addEventListener('input', (e) => {
      mark(['salary', 'monthly'], Math.max(0, Math.min(1e7, Number(e.target.value) || 0)));
      renderDerived();
    });

    // 时间输入：选完自动收起系统时间弹层（弹层不会自己关，靠失焦收起）。
    // 触发时机：分钟段落定 / 同一次聚焦里第二次改动（选完时分两步）→ 立刻收；
    // 只动了小时之类的场景则 5 秒无后续改动后兜底收起。手动键入不打断。
    const TIME_RE = /^\d{2}:\d{2}$/;
    const timeBind = (id) => {
      const el = $(id);
      let baseVal = '';
      let changes = 0;
      let typingAt = 0;
      let closeTimer = null;
      const finish = () => {
        clearTimeout(closeTimer);
        closeTimer = null;
        if (document.activeElement === el) el.blur();
      };
      el.addEventListener('focus', () => {
        baseVal = el.value;
        changes = 0;
        clearTimeout(closeTimer);
      });
      el.addEventListener('keydown', () => { typingAt = Date.now(); });
      el.addEventListener('input', (e) => {
        if (TIME_RE.test(e.target.value)) {
          mark(['salary', id], e.target.value);
          renderDerived();
        }
      });
      el.addEventListener('change', (e) => {
        const v = e.target.value;
        if (!TIME_RE.test(v)) return;
        changes += 1;
        const minuteDone = v.slice(3) !== baseVal.slice(3);
        if (Date.now() - typingAt > 600 && (minuteDone || changes >= 2)) {
          baseVal = v;
          finish();
          return;
        }
        clearTimeout(closeTimer);
        closeTimer = setTimeout(finish, 5000);
      });
    };
    timeBind('workStart');
    timeBind('workEnd');
    timeBind('lunchStart');
    timeBind('lunchEnd');

    $('lunchEnabled').addEventListener('change', (e) => {
      mark(['salary', 'lunchEnabled'], e.target.checked);
      renderDerived();
    });

    $('payday').addEventListener('change', (e) => {
      mark(['salary', 'payday'], e.target.value === '' ? null : Number(e.target.value));
    });

    // 工作日 chips
    const wdGroup = $('wdGroup');
    wdGroup.textContent = '';
    for (let d = 1; d <= 7; d++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wd';
      b.dataset.day = String(d);
      b.textContent = WD_LABEL[d - 1];
      b.addEventListener('click', () => {
        const days = new Set(cfg.salary.workDays);
        if (days.has(d)) days.delete(d); else days.add(d);
        if (!days.size) days.add(d); // 至少保留一天
        mark(['salary', 'workDays'], [...days].sort((a, x) => a - x));
        renderWorkdays();
        renderDerived();
      });
      wdGroup.appendChild(b);
    }

    // 发薪日下拉
    const sel = $('payday');
    sel.textContent = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '不设置';
    sel.appendChild(none);
    for (let i = 1; i <= 31; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${i} 号`;
      sel.appendChild(o);
    }

    // 自定义配色
    const colorBind = (id, prop) => {
      $(id).addEventListener('input', (e) => { setCustomProp(prop, e.target.value); });
    };
    colorBind('cAccent1', 'accent1');
    colorBind('cAccent2', 'accent2');
    colorBind('cBg', 'bg');

    // 自定义背景图
    $('btnPickImg').addEventListener('click', () => $('imgFile').click());
    $('imgFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = ''; // 允许重选同一张图
      if (!f) return;
      try {
        const url = await fileToSkinImage(f);
        if (url.length > IMAGE_MAX_LEN) {
          imgHint('⚠ 图片太大了，换一张小一点的试试', true);
          return;
        }
        await setCustomProp('image', url);
        imgHint('✓ 背景图已更新');
      } catch (err) {
        console.error('背景图处理失败:', err);
        imgHint('⚠ 这张图读不出来，换一张试试', true);
      }
    });
    $('btnClearImg').addEventListener('click', () => setCustomProp('image', ''));

    // 不透明度（主进程会把它记到当前皮肤名下）
    $('opacity').addEventListener('input', (e) => {
      mark(['ui', 'opacity'], Number(e.target.value) / 100);
      $('opacityVal').textContent = e.target.value + '%';
    });

    $('clickThrough').addEventListener('change', (e) => mark(['ui', 'clickThrough'], e.target.checked));
    $('alwaysOnTop').addEventListener('change', (e) => mark(['ui', 'alwaysOnTop'], e.target.checked));
    $('launchAtLogin').addEventListener('change', (e) => mark(['behavior', 'launchAtLogin'], e.target.checked));

    $('btnAddWish').addEventListener('click', () => {
      mark(['wishes'], cfg.wishes.concat([{
        id: 'w-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        emoji: '🎁',
        name: '新的小目标',
        price: 100,
      }]));
      renderWishes();
    });

    $('btnOpenDir').addEventListener('click', () => window.niuma.openConfigDir());

    // 重置：连点两次确认，防误触
    let resetArmedAt = 0;
    $('btnReset').addEventListener('click', () => {
      const btn = $('btnReset');
      if (Date.now() > resetArmedAt) {
        resetArmedAt = Date.now() + 4000;
        btn.textContent = '再点一次确认';
        setTimeout(() => {
          if (Date.now() > resetArmedAt) { btn.textContent = '重置'; resetArmedAt = 0; }
        }, 4000);
        return;
      }
      resetArmedAt = 0;
      btn.textContent = '重置';
      clearTimeout(pushTimer);
      pushTimer = null;
      dirty = null; // 丢弃未保存的改动，以重置结果为准
      window.niuma.resetConfig()
        .then((next) => {
          adopt(next);
          refresh();
          renderWishes();
          flashSaved();
        })
        .catch((e) => console.error('重置失败:', e));
    });

    $('btnQuit').addEventListener('click', () => { pushNow().finally(() => window.niuma.quit()); });
    $('btnClose').addEventListener('click', () => { pushNow().finally(() => window.close()); });
  }

  /* ---------- 初始化 ---------- */

  async function init() {
    cfg = await window.niuma.getConfig();
    bind();
    buildThemeGrid();
    renderWishes();
    refresh();

    window.niuma.onConfig((next) => {
      const focusInWishes = $('wishList').contains(document.activeElement);
      adopt(next);
      refresh();
      if (!focusInWishes) renderWishes();
    });
  }

  init().catch((e) => console.error('settings init failed:', e));
})();
