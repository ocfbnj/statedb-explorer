/**
 * Lightweight i18n: Chinese and English dictionaries, system-locale detection,
 * and string interpolation. React context lives in I18n.tsx so this file stays
 * free of JSX (keeps tsc happy with a plain .ts extension).
 */

export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'statedb-explorer.lang';

/** Detect the system language, defaulting to English when unsupported. */
export function detectLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    /* ignore storage errors */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Persist the user-selected language. */
export function saveLanguage(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

/** Flattened translation keys shared by both locales. */
const en: Record<string, string> = {
  // App / title bar
  'app.name': 'StateDB Explorer',
  'app.search': 'Search sessions, or enter #messageID to locate a message',
  'app.refresh': 'Reload database',
  'app.refreshing': 'Refreshing…',
  'nav.overview': 'Overview',
  'nav.sessions': 'Sessions',
  'nav.schema': 'Schema',
  'nav.sql': 'SQL',
  'nav.settings': 'Settings',

  // Session list panel
  'sessions.title': 'Sessions',
  'sessions.count': '{count} sessions',
  'sessions.empty': 'No sessions',
  'sessions.messages': '{n} msgs',
  'sessions.calls': '{n} calls',

  // Overview / dashboard
  'overview.title': 'Dashboard',
  'overview.subtitle': 'Hermes state.db overview',
  'overview.totalSessions': 'Sessions',
  'overview.totalMessages': 'Messages',
  'overview.totalTokens': 'Total Tokens',
  'overview.avgTokens': 'avg {v} / session',
  'overview.systemPrompts': 'System Prompts',
  'overview.recentActive': 'Recent Activity',
  'overview.tokenTop': 'Top Token Sessions',
  'overview.recentSessions': 'Recent Sessions',
  'overview.messagesSuffix': '{n} messages',
  'overview.loading': 'Loading…',

  // Conversation view
  'conv.messages': 'messages',
  'conv.toolCalls': 'tool calls',
  'conv.apiCalls': 'API calls',
  'conv.tokens': '{v}',
  'conv.copyId': 'Click to copy session ID',
  'conv.noSession': 'Select a session to view messages',
  'conv.noMessages': 'No messages',

  // Turn grouping
  'turn.system': 'System prompt',
  'turn.expand': 'Expand {n} steps ▾',
  'turn.collapse': 'Collapse steps ▴',
  'turn.toolCalls': '{n} tool calls',
  'turn.moreDots': '···',
  'turn.moreText': 'in between there were',
  'turn.viewMore': 'View full process ▾',
  'turn.emptyTitle': '(empty message)',
  'turn.charCount': '{n} chars',

  // Message card
  'msg.expandFull': 'Expand full text ({n} chars)',
  'msg.collapse': 'Collapse',
  'msg.reasoning': 'Reasoning process',
  'msg.rawData': 'Raw data',
  'msg.empty': '(empty message)',
  'msg.jumpToCall': 'Jump to tool call',
  'msg.jumpToResult': 'Jump to tool result',

  // Tool calls
  'tool.calls': 'Tool calls',

  // Schema page
  'schema.title': 'Database Schema',
  'schema.subtitle': 'Browse tables, columns, indexes and sample data',
  'schema.fields': 'Columns ({n})',
  'schema.indexes': 'Indexes ({n})',
  'schema.sample': 'Sample data ({n} rows)',
  'schema.pk': 'PK',
  'schema.notNull': 'NOT NULL',

  // SQL page
  'sql.title': 'SQL Query',
  'sql.subtitle': 'Query the database directly (read-only)',
  'sql.execute': '▶ Execute (Ctrl+Enter)',
  'sql.executing': 'Executing…',
  'sql.rows': '{n} rows',
  'sql.qqRecent': 'Recent sessions',
  'sql.qqTokenTop': 'Token Top 10',
  'sql.qqDaily': 'Messages per day',
  'sql.qqTools': 'Tool usage stats',
  'sql.qqCost': 'Cost by model',

  // Settings
  'settings.title': 'Settings',
  'settings.db': 'Database',
  'settings.file': 'File',
  'settings.size': 'Size',
  'settings.path': 'Path',
  'settings.language': 'Language',
  'settings.langEn': 'English',
  'settings.langZh': '中文',
  'settings.about': 'About',
  'settings.info': 'This tool reads the local Hermes state.db using native SQLite in the main process.',
  'settings.readonly': 'All queries run locally; no data is uploaded.',
  'settings.loadedFile': 'Loaded database file',

  // Status bar
  'status.db': 'state.db {size}',
  'status.sessions': '{n} sessions',
  'status.messages': '{n} messages',

  // Loading / errors
  'load.init': 'Initializing…',
  'load.loaded': 'state.db loaded',
  'load.dbNotFound': 'state.db not found',
  'load.failed': 'Failed to load state.db',
  'load.autoDetect': 'Auto-detecting state.db…',
  'load.pickPrompt': 'Select state.db to begin',

  // Message list state
  'msglist.loading': 'Loading…',

  // API request/response panel
  'api.title': 'API Requests',
  'api.count': '{n} calls',
  'api.empty': 'No API request records for this session',
  'api.notAvailable': 'api_hook.db not found next to state.db — enable the api_hook plugin to record API requests',
  'api.request': 'Request',
  'api.response': 'Response',
  'api.viewJson': 'View JSON',
  'api.retry': 'retry ×{n}',
  'api.finishReason': 'Finish reason',
  'api.responseModel': 'Response model',
  'api.tokens': 'Tokens',
  'api.tokenDetail': '{i} in · {o} out · {c} cached',
};

const zh: Record<string, string> = {
  'app.name': 'StateDB Explorer',
  'app.search': '搜索会话，或输入 #消息ID 定位消息',
  'app.refresh': '重新加载数据库',
  'app.refreshing': '刷新中…',
  'nav.overview': '概览',
  'nav.sessions': '会话',
  'nav.schema': '表结构',
  'nav.sql': 'SQL',
  'nav.settings': '设置',

  'sessions.title': '会话列表',
  'sessions.count': '{count} 个会话',
  'sessions.empty': '无会话',
  'sessions.messages': '{n} 消息',
  'sessions.calls': '{n} 调用',

  'overview.title': '仪表板',
  'overview.subtitle': 'Hermes state.db 数据总览',
  'overview.totalSessions': '总会话',
  'overview.totalMessages': '消息',
  'overview.totalTokens': '总 Token',
  'overview.avgTokens': '平均 {v} / 会话',
  'overview.systemPrompts': '系统提示词',
  'overview.recentActive': '最近活跃',
  'overview.tokenTop': 'Token 消耗 Top 会话',
  'overview.recentSessions': '最近会话',
  'overview.messagesSuffix': '{n} 条消息',
  'overview.loading': '加载中…',

  'conv.messages': '消息',
  'conv.toolCalls': '工具调用',
  'conv.apiCalls': 'API 调用',
  'conv.tokens': '{v}',
  'conv.copyId': '点击复制会话 ID',
  'conv.noSession': '选择一个会话以查看消息',
  'conv.noMessages': '该会话没有消息记录',

  'turn.system': '系统提示词',
  'turn.expand': '展开 {n} 条过程 ▾',
  'turn.collapse': '收起过程 ▴',
  'turn.toolCalls': '{n} 次工具调用',
  'turn.moreDots': '···',
  'turn.moreText': '中间还进行了',
  'turn.viewMore': '查看完整过程 ▾',
  'turn.emptyTitle': '(空消息)',
  'turn.charCount': '{n} chars',

  'msg.expandFull': '展开全文 ({n} chars)',
  'msg.collapse': '收起',
  'msg.reasoning': '推理过程',
  'msg.rawData': '原始数据',
  'msg.empty': '(空消息)',
  'msg.jumpToCall': '跳转到工具调用',
  'msg.jumpToResult': '跳转到工具结果',

  'tool.calls': '工具调用',

  'schema.title': '数据库表结构',
  'schema.subtitle': '浏览表结构、字段、索引和示例数据',
  'schema.fields': '字段 ({n})',
  'schema.indexes': '索引 ({n})',
  'schema.sample': '示例数据 ({n} 行)',
  'schema.pk': 'PK',
  'schema.notNull': 'NOT NULL',

  'sql.title': 'SQL 查询',
  'sql.subtitle': '直接查询数据库（只读模式）',
  'sql.execute': '▶ 执行 (Ctrl+Enter)',
  'sql.executing': '执行中…',
  'sql.rows': '{n} 行',
  'sql.qqRecent': '最近会话',
  'sql.qqTokenTop': 'Token Top 10',
  'sql.qqDaily': '每日消息量',
  'sql.qqTools': '工具调用统计',
  'sql.qqCost': '成本分布',

  'settings.title': '设置',
  'settings.db': '数据库',
  'settings.file': '文件',
  'settings.size': '大小',
  'settings.path': '路径',
  'settings.language': '语言',
  'settings.langEn': 'English',
  'settings.langZh': '中文',
  'settings.about': '关于',
  'settings.info': '本工具在主进程中使用原生 SQLite 读取本地 Hermes state.db。',
  'settings.readonly': '所有查询均在本地执行，数据不会上传。',
  'settings.loadedFile': '已加载的数据库文件',

  'status.db': 'state.db {size}',
  'status.sessions': '{n} 会话',
  'status.messages': '{n} 消息',

  'load.init': '初始化中…',
  'load.loaded': 'state.db 加载完成',
  'load.dbNotFound': '未找到 state.db',
  'load.failed': '加载 state.db 失败',
  'load.autoDetect': '自动定位 state.db…',
  'load.pickPrompt': '选择 state.db 以开始使用',

  'msglist.loading': '加载中…',

  'api.title': 'API 请求记录',
  'api.count': '{n} 次调用',
  'api.empty': '该会话暂无 API 请求记录',
  'api.notAvailable': '未在 state.db 同目录找到 api_hook.db — 启用 api_hook 插件以记录 API 请求',
  'api.request': '请求',
  'api.response': '响应',
  'api.viewJson': '查看 JSON',
  'api.retry': '重试 ×{n}',
  'api.finishReason': '结束原因',
  'api.responseModel': '响应模型',
  'api.tokens': 'Token',
  'api.tokenDetail': '{i} 输入 · {o} 输出 · {c} 缓存',
};

/** Interpolate simple `{key}` placeholders. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

/** Both locale dictionaries, exported for testing key parity. */
export const dictionaries: Record<Lang, Record<string, string>> = { en, zh };

/** Look up a key in the given locale, falling back to English then the key. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[lang];
  const template = dict[key] ?? en[key] ?? key;
  return vars ? interpolate(template, vars) : template;
}
