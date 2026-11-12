'use strict';

const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain,
  screen, nativeImage, Notification, shell,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { makeIconPNG } = require('./assets/icon');
const themes = require('./renderer/themes');
const core = require('./config-core');

const IS_DEV = process.argv.includes('--dev');
const IS_CAPTURE = process.argv.includes('--capture');

// 数据目录保持英文路径，避免中文路径带来的兼容问题。
// 截图自检模式使用独立的临时目录：绝不读写用户的真实配置。
try {
  app.setPath('userData', IS_CAPTURE
    ? path.join(app.getPath('temp'), 'niuma-motivator-capture')
    : path.join(app.getPath('appData'), 'niuma-motivator'));
} catch (e) { /* ignore */ }

/* ---------------- 配置读写（校验 / 合并逻辑见 config-core.js） ---------------- */

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
let cfg = core.initConfig();

function loadConfig() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      // 文件损坏：先备份一份再回退默认值，避免下次保存时把原文件直接覆盖掉
      console.error('[config] 读取失败，使用默认配置：', e.message);
      try { fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + '.corrupt-' + Date.now()); } catch (e2) { /* ignore */ }
    }
  }
  cfg = core.initConfig(raw);
}

let saveTimer = null;
function saveConfig(immediate = false) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const doSave = () => {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      const tmp = CONFIG_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
      fs.renameSync(tmp, CONFIG_PATH);
    } catch (e) {
      console.error('[config] 保存失败：', e.message);
    }
  };
  if (immediate) doSave();
  else saveTimer = setTimeout(doSave, 400);
}

/* ---------------- 窗口 ---------------- */

let widgetWin = null;
let settingsWin = null;
let tray = null;
let isQuitting = false;
let iconCache = null;

function appIcon() {
  if (!iconCache) {
    try { iconCache = nativeImage.createFromBuffer(makeIconPNG(32)); }
    catch (e) { iconCache = nativeImage.createEmpty(); }
  }
  return iconCache;
}

function notify(body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title: '牛马鼓励器', body, silent: true, icon: appIcon() }).show();
    }
  } catch (e) { /* ignore */ }
}

// 当前皮肤的底色（设置窗口的原生背景要跟着皮肤走，避免开关窗口时闪白/闪黑）
function themeBg() {
  try {
    return themes.getThemeById(cfg.theme.current, cfg.theme.custom).bg;
  } catch (e) {
    return '#0f1118';
  }
}

function broadcast() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    try { settingsWin.setBackgroundColor(themeBg()); } catch (e) { /* ignore */ }
  }
  for (const w of [widgetWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('config:changed', cfg);
  }
}

function applyAlwaysOnTop() {
  if (widgetWin && !widgetWin.isDestroyed()) widgetWin.setAlwaysOnTop(!!cfg.ui.alwaysOnTop, 'screen-saver');
}

function applyClickThrough() {
  if (widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.setIgnoreMouseEvents(!!cfg.ui.clickThrough, { forward: true });
  }
}

function applyLaunchAtLogin() {
  if (!app.isPackaged) return; // 开发模式下跳过，打包后生效
  try { app.setLoginItemSettings({ openAtLogin: !!cfg.behavior.launchAtLogin }); } catch (e) { /* ignore */ }
}

function setClickThrough(v, opts = {}) {
  const next = !!v;
  const changed = cfg.ui.clickThrough !== next;
  cfg.ui.clickThrough = next;
  applyClickThrough();
  saveConfig();
  broadcast();
  refreshTrayMenu();
  if (changed && next && opts.notify !== false) {
    notify('👻 鼠标穿透已开启 · 按 Ctrl+Alt+N 恢复点击');
  }
}

// 换肤：切到目标皮肤，并带出它自己记住的不透明度
function setThemeById(id) {
  const next = core.switchTheme(cfg, id);
  if (!next) return cfg;
  cfg = next;
  saveConfig();
  broadcast();
  refreshTrayMenu();
  return cfg;
}

function toggleWidgetVisible() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  if (widgetWin.isVisible()) widgetWin.hide();
  else { widgetWin.show(); widgetWin.focus(); }
}

function initialBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = cfg.window.width, h = cfg.window.height;
  let x = cfg.window.x, y = cfg.window.y;
  if (x === null || y === null) {
    x = wa.x + wa.width - w - 24;
    y = wa.y + 24;
  }
  const display = screen.getDisplayMatching({ x, y, width: w, height: h });
  const a = display.workArea;
  x = Math.min(Math.max(x, a.x - w + 80), a.x + a.width - 80);
  y = Math.min(Math.max(y, a.y), a.y + a.height - 60);
  return { x, y, width: w, height: h };
}

function attachRendererLogging(win, tag) {
  win.webContents.on('console-message', (...args) => {
    const first = args[0];
    let msg;
    if (first && typeof first === 'object' && 'message' in first) {
      msg = `[${first.level}] ${first.message} (${first.sourceId || ''}:${first.lineNumber || 0})`;
    } else {
      msg = `[${args[1]}] ${args[2]}`;
    }
    if (!IS_DEV && !IS_CAPTURE && !/error|warn/i.test(msg)) return;
    console.log(`[renderer:${tag}]`, msg);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[renderer:${tag}] 进程异常退出：`, details && details.reason);
  });
}

function createWidget() {
  const b = initialBounds();
  widgetWin = new BrowserWindow({
    ...b,
    minWidth: 400, maxWidth: 400,
    minHeight: 140, maxHeight: 720,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: !!cfg.ui.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#00000000',
    title: '牛马鼓励器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  widgetWin.setAlwaysOnTop(!!cfg.ui.alwaysOnTop, 'screen-saver');
  widgetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetWin.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  widgetWin.once('ready-to-show', () => widgetWin.show());
  widgetWin.on('moved', () => {
    try {
      const [x, y] = widgetWin.getPosition();
      cfg.window.x = x; cfg.window.y = y;
      saveConfig();
    } catch (e) { /* ignore */ }
  });
  widgetWin.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); widgetWin.hide(); }
  });
  widgetWin.on('closed', () => { widgetWin = null; });
  attachRendererLogging(widgetWin, 'widget');
  if (IS_DEV) widgetWin.webContents.openDevTools({ mode: 'detach' });
  applyClickThrough();
}

function showSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 720,
    center: true,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: themeBg(),
    title: '牛马鼓励器 · 设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
  attachRendererLogging(settingsWin, 'settings');
  if (IS_DEV) settingsWin.webContents.openDevTools({ mode: 'detach' });
}

/* ---------------- 托盘 ---------------- */

function trayTemplate() {
  return Menu.buildFromTemplate([
    { label: '显示 / 隐藏悬浮窗', click: toggleWidgetVisible },
    {
      label: '鼠标穿透', type: 'checkbox', checked: !!cfg.ui.clickThrough,
      click: (mi) => setClickThrough(mi.checked),
    },
    {
      label: '始终置顶', type: 'checkbox', checked: !!cfg.ui.alwaysOnTop,
      click: (mi) => { cfg.ui.alwaysOnTop = mi.checked; applyAlwaysOnTop(); saveConfig(); broadcast(); },
    },
    {
      label: '换肤',
      submenu: [
        ...themes.THEMES.map((t) => ({
          label: t.name, type: 'radio', checked: cfg.theme.current === t.id,
          click: () => setThemeById(t.id),
        })),
        { label: '自定义', type: 'radio', checked: cfg.theme.current === 'custom', click: () => setThemeById('custom') },
      ],
    },
    { type: 'separator' },
    { label: '设置…', click: showSettings },
    { label: '打开配置文件夹', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(trayTemplate());
}

function buildTray() {
  tray = new Tray(appIcon());
  tray.setToolTip('牛马鼓励器 · 每一秒都在进账');
  refreshTrayMenu();
  tray.on('double-click', toggleWidgetVisible);
}

/* ---------------- 快捷键 ---------------- */

function registerShortcuts() {
  const ok1 = globalShortcut.register('Control+Alt+N', () => setClickThrough(!cfg.ui.clickThrough));
  const ok2 = globalShortcut.register('Control+Alt+H', toggleWidgetVisible);
  if (!ok1 || !ok2) {
    console.warn('[shortcut] 部分全局快捷键注册失败（可能被其他程序占用），可用托盘菜单代替');
  }
}

/* ---------------- IPC ---------------- */

function ipcSetup() {
  ipcMain.handle('config:get', () => cfg);

  // 渲染层只上传改动的字段（增量补丁），由 config-core 合并 + 校验
  ipcMain.handle('config:update', (_e, patch) => {
    cfg = core.applyPatch(cfg, patch);
    saveConfig();
    applyAlwaysOnTop();
    applyClickThrough();
    applyLaunchAtLogin();
    broadcast();
    refreshTrayMenu();
    return cfg;
  });

  ipcMain.handle('clickthrough:toggle', () => {
    setClickThrough(!cfg.ui.clickThrough);
    return cfg;
  });

  // 重置：清空所有设置，恢复初始状态（默认皮肤暗夜金、月薪 5000、窗口回默认位置）
  ipcMain.handle('config:reset', () => {
    cfg = core.initConfig();
    saveConfig(true);
    applyAlwaysOnTop();
    applyClickThrough();
    applyLaunchAtLogin();
    if (widgetWin && !widgetWin.isDestroyed()) {
      try { widgetWin.setBounds(initialBounds()); } catch (e) { /* ignore */ }
    }
    broadcast();
    refreshTrayMenu();
    return cfg;
  });

  ipcMain.handle('theme:set', (_e, id) => setThemeById(String(id)));

  ipcMain.on('widget:height', (_e, h) => {
    if (!widgetWin || widgetWin.isDestroyed()) return;
    const height = Math.max(140, Math.min(720, Math.round(Number(h) || 0)));
    if (!height) return;
    try {
      const b = widgetWin.getBounds();
      if (Math.abs(b.height - height) > 1) {
        widgetWin.setBounds({ x: b.x, y: b.y, width: b.width, height });
      }
    } catch (err) { /* ignore */ }
    cfg.window.height = height;
    saveConfig();
  });

  ipcMain.on('settings:open', () => showSettings());
  ipcMain.on('app:open-config-dir', () => shell.openPath(app.getPath('userData')));
  ipcMain.on('app:quit', () => { isQuitting = true; app.quit(); });
}

/* ---------------- 截图模式（开发自检用，使用独立的临时配置） ---------------- */

async function runCapture() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const outDir = path.join(__dirname, 'shots');
  const shot = async (win, name) => {
    fs.writeFileSync(path.join(outDir, name), (await win.webContents.capturePage()).toPNG());
  };
  try {
    fs.mkdirSync(outDir, { recursive: true });
    await wait(2000);
    await shot(widgetWin, 'widget.png');

    // 鼠标穿透图标自检：强制显示操作按钮，分别截「关闭（无斜杠）/ 开启（有斜杠）」
    await widgetWin.webContents.executeJavaScript(
      "document.querySelector('.actions').style.opacity = '1'; true;");
    await wait(350); // 等 .actions 的淡入过渡结束再截
    await shot(widgetWin, 'widget-ghost-off.png');
    cfg = core.applyPatch(cfg, { ui: { clickThrough: true } });
    applyClickThrough();
    broadcast();
    await wait(500);
    await shot(widgetWin, 'widget-ghost-on.png');
    cfg = core.applyPatch(cfg, { ui: { clickThrough: false } });
    applyClickThrough();
    broadcast();
    await wait(300);

    // 可选：NIUMA_CAPTURE_IMG=1 给自定义皮肤塞一张测试背景图
    if (process.env.NIUMA_CAPTURE_IMG) {
      const img = nativeImage.createFromBuffer(makeIconPNG(256)).toDataURL();
      cfg = core.applyPatch(cfg, { theme: { custom: { image: img } } });
      setThemeById('custom');
      await wait(900);
      await shot(widgetWin, 'widget-img.png');
    }

    showSettings();
    await wait(2000);
    await shot(settingsWin, 'settings.png');
    // 图标选择弹层自检：点开第一个小目标的图标按钮
    await settingsWin.webContents.executeJavaScript(
      "document.querySelector('#wishList .in-emoji').click(); true;");
    await wait(400);
    await shot(settingsWin, 'settings-emoji.png');
    await settingsWin.webContents.executeJavaScript(
      "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true;");
    await wait(200);
    // 滚动到底部再截一张（换肤区在下半部分）
    await settingsWin.webContents.executeJavaScript(
      "document.querySelector('.s-body').scrollTop = 99999; true;");
    await wait(500);
    await shot(settingsWin, 'settings-2.png');

    // 可选：NIUMA_CAPTURE_SKIN=cream,sakura 逐个换肤再截悬浮窗 + 设置页
    const skins = String(process.env.NIUMA_CAPTURE_SKIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const skin of skins) {
      setThemeById(skin);
      await wait(900);
      await shot(widgetWin, `widget-${skin}.png`);
      if (settingsWin && !settingsWin.isDestroyed()) {
        await settingsWin.webContents.executeJavaScript(
          "document.querySelector('.s-body').scrollTop = 0; true;");
        await wait(400);
        await shot(settingsWin, `settings-${skin}.png`);
      }
    }
    console.log('[capture] 截图已保存到 shots/');
  } catch (e) {
    console.error('[capture] 失败：', e);
  }
  isQuitting = true;
  app.quit();
}

/* ---------------- 生命周期 ---------------- */

process.on('unhandledRejection', (e) => console.error('[main] unhandledRejection:', e));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (widgetWin && !widgetWin.isDestroyed()) { widgetWin.show(); widgetWin.focus(); }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.niuma.motivator');
    Menu.setApplicationMenu(null);
    ipcSetup();
    if (IS_CAPTURE) {
      // 自检：固定用默认配置，不占用托盘和全局快捷键（不打扰正在运行的正式实例）
      cfg = core.initConfig();
      createWidget();
      setTimeout(runCapture, 600);
      return;
    }
    loadConfig();
    applyLaunchAtLogin();
    createWidget();
    buildTray();
    registerShortcuts();
  });

  app.on('window-all-closed', () => { /* 托盘常驻，不退出 */ });
  app.on('before-quit', () => { isQuitting = true; saveConfig(true); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
