# StateDB Explorer (Electron)

Hermes `state.db` 的可视化探索客户端，基于 Electron + React + native SQLite (node:sqlite)。

## 架构

```
┌────────────────────────────────────────────────────────────┐
│  Electron 主进程 (electron/main.cjs)                        │
│  ├─ native SQLite (node:sqlite) 加载本地 state.db（主进程，仅加载一次）           │
│  ├─ IPC: db:init / db:autoload / db:pick / db:query / exec  │
│  └─ 创建 BrowserWindow                                       │
└────────────────────────────────────────────────────────────┘
                          ↕ contextBridge (preload.cjs)
┌────────────────────────────────────────────────────────────┐
│  渲染进程 (React + Vite + TS)                               │
│  ├─ src/api.ts 通过 window.stateDB (IPC) 查询               │
│  ├─ UI: 仪表板 / 会话 / 表结构 / SQL                        │
│  └─ 所有查询在主进程执行，数据不上传                        │
└────────────────────────────────────────────────────────────┘
```

数据库读取从浏览器内移至 **主进程**，通过 IPC 查询，天然安全且不暴露 Node 能力给渲染层。

## 开发运行

```bash
npm install
npm run dev:renderer   # 终端1: 启动 Vite (5173)
npm run dev:electron   # 终端2: 启动 Electron (连 Vite)
```

或一键：`npm run dev`（concurrently 同时启动两者）

## 生产打包

```bash
npm run build          # 构建前端到 dist/
npm start              # 直接以打包前端运行 Electron
```

## 数据定位

主进程自动在以下位置查找 `state.db`：
- `%LOCALAPPDATA%\hermes\state.db`
- `~/.local/share/hermes/state.db`
- 环境变量 `HERMES_STATE_DIR`

未找到时会弹出文件选择对话框手动指定。
