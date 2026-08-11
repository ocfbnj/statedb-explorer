// ============================================================
// StateDB Explorer — Electron main process
// Responsibilities: create the window, open state.db via node:sqlite, handle IPC queries
// Note: node:sqlite is native SQLite and auto-reads the WAL file,
//        so the latest data written by Hermes (including un-checkpointed parts) is visible.
// ============================================================
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const isDev = !app.isPackaged;

// Locate the Hermes home directory (where state.db lives) across platforms.
// Mirrors hermes_constants.get_hermes_home() from the Hermes source:
//   - Windows:  %LOCALAPPDATA%\hermes  (fallback: ~/AppData/Local/hermes)
//   - macOS/Linux/POSIX: ~/.hermes
//   - HERMES_HOME env var always takes precedence.
function findHermesDir() {
  const candidates = [
    process.env.HERMES_HOME,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'hermes'),
    path.join(os.homedir(), 'AppData', 'Local', 'hermes'),
    path.join(os.homedir(), '.hermes'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'state.db'))) return c;
  }
  return candidates.find(Boolean) || '';
}

let db = null;         // Current database instance (DatabaseSync)
let dbPath = '';       // Path of the currently loaded db
let dbSize = 0;
let apiHookDb = null;  // api_hook.db instance (optional, same Hermes home)

// Query helper (node:sqlite Statements need no explicit close)
function queryRows(sql, params = []) {
  if (!db) throw new Error('state.db not loaded');
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  if (!db) throw new Error('state.db not loaded');
  return db.prepare(sql).get(...params) ?? null;
}

function execSql(sql) {
  if (!db) throw new Error('state.db not loaded');
  // Classify the query: SELECT/PRAGMA/WITH use prepare().all(), everything else uses exec()
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
  // If a db is already open, close it first (closing auto-checkpoints the WAL into the main file)
  if (db) { try { db.close(); } catch { /* */ } }
  // Open in read-only mode; even while Hermes is writing, the WAL is safely merged on read
  db = new DatabaseSync(filePath, { readOnly: true });
  dbPath = filePath;
  dbSize = fs.statSync(filePath).size;
  // Open api_hook.db (same directory, optional) read-only for API request/response lookup
  try {
    const hookPath = path.join(path.dirname(filePath), 'api_hook.db');
    if (fs.existsSync(hookPath)) {
      if (apiHookDb) { try { apiHookDb.close(); } catch { /* */ } }
      apiHookDb = new DatabaseSync(hookPath, { readOnly: true });
      // Attach state.db (the main db file) so the correlation sub-query can
      // match api_calls against messages by session + timestamp window.
      try {
        apiHookDb.exec(`ATTACH DATABASE '${filePath.replace(/'/g, "''")}' AS state`);
      } catch { /* correlation still works without the message join */ }
    }
  } catch { apiHookDb = null; }
  return { path: filePath, size: dbSize, name: path.basename(filePath) };
}

// ============================================================
// IPC Handler
// ============================================================
function registerIpc() {
  // Init (node:sqlite needs no async load; kept for compatibility)
  ipcMain.handle('db:init', async () => ({ ok: true }));

  // Locate and load state.db automatically
  ipcMain.handle('db:autoload', async () => {
    const dir = findHermesDir();
    const p = path.join(dir, 'state.db');
    if (!fs.existsSync(p)) {
      return { ok: false, error: `state.db not found: ${p}` };
    }
    const meta = loadDb(p);
    return { ok: true, ...meta };
  });

  // Let the user pick a db file manually
  ipcMain.handle('db:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select state.db',
      filters: [{ name: 'SQLite', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false, error: 'Cancelled' };
    const meta = loadDb(filePaths[0]);
    return { ok: true, ...meta };
  });

  // Generic query
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

  // Get db metadata
  ipcMain.handle('db:meta', () => {
    return { ok: !!db, path: dbPath, size: dbSize, name: path.basename(dbPath || '') };
  });

  // Reload the current db from disk (refresh data, reopen the connection to see the latest WAL)
  ipcMain.handle('db:reload', () => {
    if (!dbPath || !fs.existsSync(dbPath)) {
      return { ok: false, error: 'No loaded db file or file does not exist' };
    }
    try {
      const meta = loadDb(dbPath);
      return { ok: true, ...meta };
    } catch (e) {
      return { ok: false, error: e.message || 'Reload failed' };
    }
  });

  // List API request/response records for a session from api_hook.db.
  // Each api_call row is joined to the assistant message whose timestamp falls
  // inside the call's [started_at, ended_at] window (messages are written right
  // after the API response arrives). Returns rows with the message id attached.
  ipcMain.handle('api:listApiCalls', (_e, sessionId) => {
    if (!apiHookDb) return { ok: true, rows: [], available: false };
    try {
      const stmt = apiHookDb.prepare(`
        WITH candidates AS (
          SELECT c.api_request_id, c.session_id, c.started_at, c.ended_at,
                 m.id AS message_id,
                 ABS(m.timestamp - COALESCE(c.ended_at, c.started_at)) AS dist
          FROM api_calls c
          LEFT JOIN state.messages m
            ON m.session_id = c.session_id AND m.role = 'assistant'
           AND m.timestamp >= c.started_at
           AND m.timestamp <= COALESCE(c.ended_at, c.started_at) + 2
          WHERE c.session_id = ?
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY api_request_id ORDER BY dist) AS rn
          FROM candidates
        )
        SELECT c.api_request_id, c.session_id, c.api_call_count, c.retry_count,
               c.model, c.provider, c.api_mode, c.started_at, c.ended_at,
               c.finish_reason, c.response_model, c.request, c.response, c.usage,
               r.message_id
        FROM api_calls c
        LEFT JOIN ranked r ON r.api_request_id = c.api_request_id AND r.rn = 1
        WHERE c.session_id = ?
        ORDER BY c.started_at ASC
      `);
      const rows = stmt.all(sessionId, sessionId);
      return { ok: true, rows, available: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Whether api_hook.db was found alongside state.db
  ipcMain.handle('api:hookAvailable', () => ({ ok: true, available: !!apiHookDb }));
}

// ============================================================
// Window
// ============================================================
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#121314', /* 2026 Dark editor.background */
    title: 'StateDB Explorer',
    // App icon (used by the window in dev and by the packaged executable)
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    // Custom title bar: hide the system title bar, draw it in HTML, keep the native window controls
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',   // Transparent control-button background to blend into the custom title bar
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
  // Remove the default application menu bar (File/Edit/View/Window/Help)
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
