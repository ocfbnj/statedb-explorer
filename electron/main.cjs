// ============================================================
// StateDB Explorer — Electron 主进程
// 负责：创建窗口 + 用 node:sqlite 打开 state.db + IPC 查询
// 说明：node:sqlite 是原生 SQLite，自动读取 WAL 文件，
//        因此能看到 Hermes 实时写入的最新数据（含未 checkpoint 的部分）
// ============================================================
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const isDev = !app.isPackaged;

// 定位 Hermes state.db
function findHermesDir() {
  const candidates = [
    process.env.HERMES_STATE_DIR,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'hermes'),
    path.join(os.homedir(), 'AppData', 'Local', 'hermes'),
    path.join(os.homedir(), '.local', 'share', 'hermes'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'state.db'))) return c;
  }
  return candidates.find(Boolean) || '';
}

let db = null;         // 当前数据库实例 (DatabaseSync)
let dbPath = '';       // 当前加载的 db 路径
let dbSize = 0;

// 查询工具（node:sqlite 的 Statement 无需显式 close）
function queryRows(sql, params = []) {
  if (!db) throw new Error('state.db 未加载');
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  if (!db) throw new Error('state.db 未加载');
  return db.prepare(sql).get(...params) ?? null;
}

function execSql(sql) {
  if (!db) throw new Error('state.db 未加载');
  // 分离出查询类型：SELECT/PRAGMA/WITH 用 prepare().all()，其他用 exec()
  const trimmed = sql.trim();
  const isSelect = /^(select|pragma|with)\b/i.test(trimmed);
  if (isSelect) {
    const stmt = db.prepare(sql);
    const rows = stmt.all();
    const columns = stmt.columns().map(c => c.name);
    return { columns, rows };
  }
  db.exec(sql);
  return { columns: [], rows: [] };
}

function loadDb(filePath) {
  // 若已有打开的 db，先关闭（关闭会自动 checkpoint WAL 回主文件）
  if (db) { try { db.close(); } catch { /* */ } }
  // 以只读方式打开；即使 Hermes 正在写，也能安全读取并自动合并 WAL
  db = new DatabaseSync(filePath, { readOnly: true });
  dbPath = filePath;
  dbSize = fs.statSync(filePath).size;
  return { path: filePath, size: dbSize, name: path.basename(filePath) };
}

// ============================================================
// IPC Handler
// ============================================================
function registerIpc() {
  // 初始化（node:sqlite 无需异步加载，兼容保留）
  ipcMain.handle('db:init', async () => ({ ok: true }));

  // 自动定位并加载 state.db
  ipcMain.handle('db:autoload', async () => {
    const dir = findHermesDir();
    const p = path.join(dir, 'state.db');
    if (!fs.existsSync(p)) {
      return { ok: false, error: `未找到 state.db: ${p}` };
    }
    const meta = loadDb(p);
    return { ok: true, ...meta };
  });

  // 手动选择 db 文件
  ipcMain.handle('db:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择 state.db',
      filters: [{ name: 'SQLite', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false, error: '已取消' };
    const meta = loadDb(filePaths[0]);
    return { ok: true, ...meta };
  });

  // 通用查询
  ipcMain.handle('db:query', (_e, sql, params = []) => {
    try { return { ok: true, rows: queryRows(sql, params) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('db:queryOne', (_e, sql, params = []) => {
    try { return { ok: true, row: queryOne(sql, params) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('db:exec', (_e, sql) => {
    try { return { ok: true, ...execSql(sql) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // 获取 db 元信息
  ipcMain.handle('db:meta', () => {
    return { ok: !!db, path: dbPath, size: dbSize, name: path.basename(dbPath || '') };
  });

  // 重新从磁盘加载当前 db（刷新数据，重新打开连接以看到最新 WAL 数据）
  ipcMain.handle('db:reload', () => {
    if (!dbPath || !fs.existsSync(dbPath)) {
      return { ok: false, error: '当前无已加载的 db 文件或文件不存在' };
    }
    try {
      const meta = loadDb(dbPath);
      return { ok: true, ...meta };
    } catch (e) {
      return { ok: false, error: e.message || '重新加载失败' };
    }
  });
}

// ============================================================
// 窗口
// ============================================================
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#121314', /* 2026 Dark editor.background */
    title: 'StateDB Explorer',
    // VS Code 风格标题栏：隐藏系统标题栏，用 HTML 自绘，保留系统窗口控制按钮
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',   // 控制按钮背景透明，融入自绘标题栏
      symbolColor: '#8C8C8C', /* titleBar.activeForeground */
      height: 35,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  // 移除默认应用菜单栏（File/Edit/View/Window/Help）
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
