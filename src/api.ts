/* ==================== Types ==================== */

export interface Session {
  id: string;
  title: string;
  started_at: number;
  last_activity_at: number;
  last_activity_description: string;
  message_count: number;
  tool_call_count: number;
  api_call_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  model: string;
  source: string;
}

export interface SessionListResponse {
  items: Session[];
  total: number;
  limit: number;
  offset: number;
}

export interface Message {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_calls: string;
  tool_call_id: string;
  name: string;
  reasoning_content: string;
  created_at: number;
  token_count: number;
  model: string;
  stop_reason: string;
}

export interface Summary {
  sessions: number;
  messages: number;
  system_prompts: number;
  total_tokens: number;
  total_cost_usd: number;
  db_size: number;
}

export interface SystemPrompt {
  hash: string;
  content: string;
  use_count: number;
}

/* ==================== IPC 桥（Electron） ==================== */

interface StateDBBridge {
  init(): Promise<{ ok: boolean }>;
  autoload(): Promise<{ ok: boolean; error?: string; path?: string; size?: number; name?: string }>;
  pick(): Promise<{ ok: boolean; error?: string; path?: string; size?: number; name?: string }>;
  query(sql: string, params?: any[]): Promise<{ ok: boolean; rows?: any[]; error?: string }>;
  queryOne(sql: string, params?: any[]): Promise<{ ok: boolean; row?: any; error?: string }>;
  exec(sql: string): Promise<{ ok: boolean; columns?: string[]; rows?: any[]; error?: string }>;
  reload(): Promise<{ ok: boolean; error?: string; path?: string; size?: number; name?: string }>;
  meta(): Promise<{ ok: boolean; path: string; size: number; name: string }>;
}

declare global {
  interface Window {
    stateDB?: StateDBBridge;
  }
}

let onProgressFn: ((stage: string, percent: number) => void) | null = null;
export function onProgress(cb: (stage: string, percent: number) => void) {
  onProgressFn = cb;
}
function progress(stage: string, percent: number) {
  if (onProgressFn) onProgressFn(stage, percent);
}

/* ==================== DB 状态 ==================== */

let dbMeta = { path: '', size: 0, name: '' };
let readyResolve: () => void;
const ready = new Promise<void>(resolve => { readyResolve = resolve; });

function bridge(): StateDBBridge {
  if (!window.stateDB) throw new Error('Electron IPC 桥不可用（请用 Electron 客户端运行）');
  return window.stateDB;
}

/** 初始化：等待 Electron 主进程数据库就绪，然后自动加载 state.db */
async function init() {
  try {
    await bridge().init();
    progress('初始化数据库连接', 20);
    const res = await bridge().autoload();
    if (res.ok) {
      dbMeta = { path: res.path || '', size: res.size || 0, name: res.name || 'state.db' };
      progress('state.db 加载完成', 100);
    } else {
      // 自动加载失败，提示用户手动选择
      progress(`未自动找到 state.db: ${res.error}`, 30);
      const picked = await bridge().pick();
      if (picked.ok) {
        dbMeta = { path: picked.path || '', size: picked.size || 0, name: picked.name || 'state.db' };
        progress('state.db 加载完成', 100);
      } else {
        throw new Error(res.error || '未加载数据库');
      }
    }
  } catch (e: any) {
    console.error('DB init failed:', e);
    progress(`加载失败: ${e.message}`, 0);
  }
  readyResolve();
}

init();

export function whenReady() { return ready; }

function requireReady() {
  if (!dbMeta.path) throw new Error('state.db 未加载');
}

/* ==================== 查询封装 ==================== */

async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  await ready;
  requireReady();
  const res = await bridge().query(sql, params);
  if (!res.ok) throw new Error(res.error || '查询失败');
  return (res.rows || []) as T[];
}

async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  await ready;
  requireReady();
  const res = await bridge().queryOne(sql, params);
  if (!res.ok) throw new Error(res.error || '查询失败');
  return (res.row ?? null) as T | null;
}

async function execSql(sql: string) {
  await ready;
  requireReady();
  const res = await bridge().exec(sql);
  if (!res.ok) throw new Error(res.error || '执行失败');
  return { columns: res.columns || [], rows: res.rows || [] };
}

/* ==================== API ==================== */

export const api = {
  isReady: () => !!dbMeta.path,

  summary: async (): Promise<Summary> => {
    const sessions = (await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM sessions WHERE archived = 0 OR archived IS NULL"))?.c ?? 0;
    const messages = (await queryOne<{ c: number }>("SELECT COUNT(*) as c FROM messages"))?.c ?? 0;
    const sysPrompts = (await queryOne<{ c: number }>("SELECT COUNT(*) as c FROM system_prompts"))?.c ?? 0;
    const tokenRow = await queryOne<{ t: number }>(
      "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as t FROM sessions");
    const costRow = await queryOne<{ c: number }>(
      "SELECT COALESCE(SUM(estimated_cost_usd), 0) as c FROM sessions");
    return {
      sessions, messages, system_prompts: sysPrompts,
      total_tokens: tokenRow?.t ?? 0,
      total_cost_usd: costRow?.c ?? 0,
      db_size: dbMeta.size,
    };
  },

  listSessions: async (params: { limit?: number; offset?: number; q?: string } = {}): Promise<SessionListResponse> => {
    const limit = Math.min(params.limit || 50, 500);
    const offset = params.offset || 0;
    const search = params.q || '';
    let where = 'WHERE (archived = 0 OR archived IS NULL)';
    const queryParams: any[] = [];
    if (search) {
      where += ' AND (title LIKE ? OR id LIKE ? OR last_activity_description LIKE ?)';
      const s = `%${search}%`;
      queryParams.push(s, s, s);
    }
    const countRow = await queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM sessions ${where}`, queryParams);
    const rows = await query<any>(`
      SELECT id, COALESCE(title, '(无标题)') as title,
             started_at as started_at,
             COALESCE(last_activity_at, started_at) as last_activity_at,
             COALESCE(last_activity_description, '') as last_activity_description,
             COALESCE(message_count, 0) as message_count,
             COALESCE(tool_call_count, 0) as tool_call_count,
             COALESCE(api_call_count, 0) as api_call_count,
             COALESCE(input_tokens, 0) as input_tokens,
             COALESCE(output_tokens, 0) as output_tokens,
             COALESCE(estimated_cost_usd, 0) as estimated_cost_usd,
             COALESCE(model, '') as model,
             COALESCE(source, '') as source
      FROM sessions ${where}
      ORDER BY COALESCE(last_activity_at, started_at) DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset]);
    return { items: rows as Session[], total: countRow?.c ?? 0, limit, offset };
  },

  listMessages: async (sessionId: string): Promise<Message[]> => {
    return query<Message>(`
      SELECT id, session_id, role, content,
             COALESCE(tool_calls, '') as tool_calls,
             COALESCE(tool_call_id, '') as tool_call_id,
             COALESCE(tool_name, '') as name,
             COALESCE(reasoning_content, '') as reasoning_content,
             timestamp as created_at,
             COALESCE(token_count, 0) as token_count,
             '' as model,
             COALESCE(finish_reason, '') as stop_reason
      FROM messages
      WHERE session_id = ?
      ORDER BY id ASC
    `, [sessionId]);
  },

  /** 按消息 id 查找，返回消息及其所属会话（用于按 id 定位） */
  getMessageById: async (id: number): Promise<Message | null> => {
    return queryOne<Message>(`
      SELECT id, session_id, role, content,
             COALESCE(tool_calls, '') as tool_calls,
             COALESCE(tool_call_id, '') as tool_call_id,
             COALESCE(tool_name, '') as name,
             COALESCE(reasoning_content, '') as reasoning_content,
             timestamp as created_at,
             COALESCE(token_count, 0) as token_count,
             '' as model,
             COALESCE(finish_reason, '') as stop_reason
      FROM messages
      WHERE id = ?
    `, [id]);
  },

  listSystemPrompts: async (): Promise<SystemPrompt[]> => {
    return query<SystemPrompt>(`
      SELECT hash, substr(prompt, 1, 200) as content,
             (SELECT COUNT(*) FROM sessions s WHERE s.system_prompt_hash = p.hash) as use_count
      FROM system_prompts p
      ORDER BY use_count DESC
      LIMIT 50
    `);
  },

  getSystemPrompt: async (hash: string) => {
    return queryOne<{ hash: string; content: string }>(
      "SELECT hash, prompt as content FROM system_prompts WHERE hash = ?", [hash]);
  },

  getSystemPromptBySession: async (sessionId: string): Promise<string | null> => {
    const row = await queryOne<{ prompt: string | null }>(`
      SELECT p.prompt FROM sessions s
      LEFT JOIN system_prompts p ON s.system_prompt_hash = p.hash
      WHERE s.id = ?
    `, [sessionId]);
    return row?.prompt || null;
  },

  listTables: async (): Promise<any[]> => {
    const tables = await query<{ name: string; type: string }>(`
      SELECT name, type FROM sqlite_master
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'
      ORDER BY name
    `);
    const result = [];
    for (const t of tables) {
      try {
        const count = await queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM "${t.name}"`);
        result.push({ ...t, rows: count?.c ?? 0 });
      } catch {
        result.push({ ...t, rows: 0 });
      }
    }
    return result;
  },

  getTableInfo: async (name: string) => {
    const columns = (await query<any>(`PRAGMA table_info("${name}")`)).map(c => ({
      cid: c.cid, name: c.name, type: c.type,
      notnull: c.notnull, pk: c.pk, default: c.dflt_value,
    }));
    const idxRows = await query<any>(`PRAGMA index_list("${name}")`);
    const indexes = [];
    for (const idx of idxRows) {
      const colRows = await query<any>(`PRAGMA index_info("${idx.name}")`);
      indexes.push({
        name: idx.name, unique: idx.unique, origin: idx.origin, partial: idx.partial,
        columns: colRows.map((c: any) => c.name),
      });
    }
    let sampleRows: any[] = [];
    try { sampleRows = await query<any>(`SELECT * FROM "${name}" LIMIT 5`); } catch { /* */ }
    return { columns, indexes, sample_rows: sampleRows };
  },

  executeSql: async (sql: string) => {
    return execSql(sql);
  },

  /** 重新从磁盘加载 state.db，返回新的元信息 */
  reload: async (): Promise<{ ok: boolean; error?: string; path?: string; size?: number; name?: string }> => {
    const res = await bridge().reload();
    if (res.ok) {
      dbMeta = { path: res.path || '', size: res.size || 0, name: res.name || 'state.db' };
    }
    return res;
  },

  get dbSize() { return dbMeta.size; },
};

/* ==================== Formatters ==================== */

export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/** 格式化大小但去掉 B 单位（用于 token 数量展示，如 1.6 M / 794 K） */
export function formatSizeNoB(bytes: number): string {
  if (!bytes || bytes < 0) return '0';
  if (bytes < 1024) return String(bytes);
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' K';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' M';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' G';
}

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return (seconds * 1000).toFixed(0) + 'ms';
  if (seconds < 60) return seconds.toFixed(2) + 's';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}
