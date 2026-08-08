import { useState, useEffect, useCallback } from 'react';
import {
  api, whenReady, onProgress, formatSize, formatSizeNoB, formatTime,
} from './api';
import type { Session, Message, Summary } from './api';
import { JsonViewerModal } from './JsonTree';
import './styles.css';

type Page = 'dashboard' | 'sessions' | 'schema' | 'sql';

/* ---- VS Code 风格刷新图标（SVG） ---- */
function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? 'spin' : ''}
      width="14" height="14"
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

/* ================================================================
   根组件
   ================================================================ */
export default function App() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState('初始化...');
  const [loadPercent, setLoadPercent] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState<Page>('sessions');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [jumpToMsgId, setJumpToMsgId] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jsonModal, setJsonModal] = useState<{ title: string; data: any } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dbMeta, setDbMeta] = useState<{ path?: string; size: number; name: string }>({ size: 0, name: '' });

  useEffect(() => {
    onProgress((stage, pct) => { setLoading(stage); setLoadPercent(pct); });
  }, []);

  // 初始化：等待主进程加载 state.db
  useEffect(() => {
    whenReady().then(async () => {
      setReady(true);
      try {
        // 从 Electron 主进程获取已加载的 db 元信息
        if (window.stateDB) {
          const meta = await window.stateDB.meta();
          setDbMeta({ path: meta.path, size: meta.size, name: meta.name });
        }
        const [sess, summ] = await Promise.all([
          api.listSessions({ limit: 100, q: search }),
          api.summary(),
        ]);
        setSessions(sess.items);
        setTotalSessions(sess.total);
        setSummary(summ);
        if (sess.items.length > 0) setSelectedId(sess.items[0].id);
      } catch (e: any) {
        setLoadError(e?.message || '加载 state.db 失败');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜索会话
  const refreshSessions = useCallback(async () => {
    if (!api.isReady()) return;
    // 若输入 #消息ID 格式，不触发会话过滤（用于定位消息）
    const isMsgIdSearch = /^#?\d+$/.test(search.trim());
    const res = await api.listSessions({ limit: 100, q: isMsgIdSearch ? '' : search });
    setSessions(res.items);
    setTotalSessions(res.total);
  }, [search]);

  // 完整刷新：重新从磁盘加载 state.db，再刷新所有数据
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.reload();
      if (!res.ok) {
        setLoadError(res.error || '刷新失败');
        setRefreshing(false);
        return;
      }
      setDbMeta(prev => ({ ...prev, size: res.size || 0, path: res.path || prev.path, name: res.name || prev.name }));
      const [sess, summ] = await Promise.all([
        api.listSessions({ limit: 100, q: search }),
        api.summary(),
      ]);
      setSessions(sess.items);
      setTotalSessions(sess.total);
      setSummary(summ);
    } catch (e: any) {
      setLoadError(e?.message || '刷新失败');
    }
    setRefreshing(false);
  }, [search]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // 加载所选会话消息
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    api.listMessages(selectedId).then(setMessages).catch(() => setMessages([]));
  }, [selectedId]);

  const selectedSession = sessions.find(s => s.id === selectedId);
  const showSessionPanel = page === 'sessions';

  function viewRawJson(title: string, data: any) {
    setJsonModal({ title, data });
  }

  // 处理标题栏搜索框回车：若输入 #数字 则按消息 id 定位
  async function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const val = search.trim();
    const m = val.match(/^#?(\d+)$/);
    if (!m) return; // 非数字则走普通会话搜索
    const msgId = parseInt(m[1], 10);
    try {
      const msg = await api.getMessageById(msgId);
      if (msg) {
        setSelectedId(msg.session_id);
        setJumpToMsgId(msgId);
      }
    } catch { /* */ }
  }

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '📊', label: '概览' },
    { id: 'sessions', icon: '💬', label: '会话' },
    { id: 'schema', icon: '🗄️', label: '表结构' },
    { id: 'sql', icon: '🔍', label: 'SQL' },
  ];

  // 加载/初始界面
  if (!ready || (!api.isReady() && !loadError)) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg-base)', color: 'var(--text-muted)',
      }}>
        <div style={{ fontSize: 48 }} className="logo-icon">⚡</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          StateDB Explorer
        </div>
        <div style={{ width: 280 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>{loading}</div>
          <div style={{ width: '100%', height: 6, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${loadPercent}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 11, marginTop: 4, textAlign: 'right' }}>{loadPercent}%</div>
        </div>
        {loadError && (
          <div style={{ fontSize: 12, color: 'var(--error)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
            {loadError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header — 自绘标题栏（VS Code 风格） */}
      <header className="header">
        <div className="header-logo no-drag">
          <span className="logo-icon">⚡</span> StateDB Explorer
        </div>
        <div className="header-search no-drag">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索会话，或输入 #消息ID 定位消息"
          />
        </div>
        <div className="header-actions no-drag" />
      </header>

      <div className="main">
        {/* Icon Rail */}
        <nav className="sidebar-rail">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`rail-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
              title={item.label}
            >
              <span>{item.icon}</span>
              <span className="rail-label">{item.label}</span>
            </button>
          ))}
          <button
            className="rail-item rail-item-bottom"
            title="设置"
            onClick={() => setShowSettings(true)}
          >
            <span>⚙️</span>
            <span className="rail-label">设置</span>
          </button>
        </nav>

        {/* Session List Panel */}
        {showSessionPanel && (
          <aside className="sub-panel">
            <div className="panel-header">
              <div className="panel-title">会话列表</div>
              <div className="panel-subtitle">{totalSessions} 个会话</div>
            </div>
            <div className="session-list">
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`session-item ${selectedId === s.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="session-title">{s.title || '(无标题)'}</div>
                  <div className="session-meta">
                    <span>{s.message_count} 消息</span>
                    <span className="dot" />
                    <span>{s.api_call_count ?? 0} 调用</span>
                    <span className="dot" />
                    <span>{formatSizeNoB(s.input_tokens + s.output_tokens)}</span>
                    <span className="dot" />
                    <span>{formatTime(s.last_activity_at)}</span>
                  </div>
                </div>
              ))}
              {sessions.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)' }}>无会话</div>
              )}
            </div>
          </aside>
        )}

        {/* Content */}
        <main className={`content ${page === 'sessions' ? 'no-pad' : ''}`}>
          {page === 'dashboard' && (
            <Dashboard
              summary={summary}
              sessions={sessions.slice(0, 8)}
              onSelectSession={(id) => { setSelectedId(id); setPage('sessions'); }}
            />
          )}
          {page === 'sessions' && selectedSession && (
            <ConversationView
              session={selectedSession}
              messages={messages}
              onViewRaw={viewRawJson}
              jumpToMsgId={jumpToMsgId}
              onJumpHandled={() => setJumpToMsgId(null)}
            />
          )}
          {page === 'sessions' && !selectedSession && (
            <EmptyState icon="💬" title="选择一个会话" desc="从左侧列表选择会话以查看详情" />
          )}
          {page === 'schema' && <SchemaPage />}
          {page === 'sql' && <SqlPage />}
        </main>
      </div>

      {/* Footer */}
      <footer className="footer">
        <span>state.db {summary ? formatSize(summary.db_size) : '—'}</span>
        <span>{totalSessions} 会话</span>
        <span>{summary?.messages ?? 0} 消息</span>
        <span className="footer-right">
          <button
            className="panel-refresh"
            onClick={handleRefresh}
            title="重新加载数据库"
            disabled={refreshing}
          >
            <RefreshIcon spinning={refreshing} />
          </button>
        </span>
      </footer>

      {jsonModal && (
        <JsonViewerModal
          title={jsonModal.title}
          data={jsonModal.data}
          onClose={() => setJsonModal(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          dbMeta={dbMeta}
        />
      )}
    </div>
  );
}

/* ================================================================
   Empty State
   ================================================================ */
function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      <div className="empty-desc">{desc}</div>
    </div>
  );
}

/* ================================================================
   Dashboard
   ================================================================ */
function Dashboard({
  summary, sessions, onSelectSession,
}: {
  summary: Summary | null;
  sessions: Session[];
  onSelectSession: (id: string) => void;
}) {
  if (!summary) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>加载中...</div>;

  const avgTokens = summary.sessions > 0 ? Math.round(summary.total_tokens / summary.sessions) : 0;
  const topSessions = [...sessions]
    .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
    .slice(0, 6);
  const maxTokens = Math.max(...topSessions.map(s => s.input_tokens + s.output_tokens), 1);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">仪表板</div>
        <div className="page-subtitle">Hermes state.db 运行数据总览</div>
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard icon="💬" label="总会话" value={summary.sessions.toLocaleString()} cls="accent"
          sub={`${summary.messages.toLocaleString()} 条消息`} />
        <StatCard icon="📊" label="总 Token" value={formatSizeNoB(summary.total_tokens)} cls="teal"
          sub={`平均 ${formatSizeNoB(avgTokens)} / 会话`} />
        <StatCard icon="🧠" label="系统提示词" value={summary.system_prompts.toLocaleString()} cls="purple" sub="独立存储的提示词" />
        <StatCard icon="🕐" label="最近活跃" value={sessions.length > 0 ? formatTime(sessions[0].last_activity_at) : '—'} cls="purple" />
      </div>

      <div className="dash-cards-row">
        <div className="dash-card">
          <div className="dash-card-title">Token 消耗 Top 会话</div>
          <div className="bar-chart">
            {topSessions.map(s => {
              const tokens = s.input_tokens + s.output_tokens;
              return (
                <div key={s.id} className="bar-row" onClick={() => onSelectSession(s.id)} style={{ cursor: 'pointer' }}>
                  <div className="bar-label" title={s.title}>{s.title}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(tokens / maxTokens * 100).toFixed(1)}%` }} />
                  </div>
                  <div className="bar-value">{formatSizeNoB(tokens)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-title">最近会话</div>
          <div className="recent-list">
            {sessions.slice(0, 8).map(s => (
              <div key={s.id} className="recent-item" onClick={() => onSelectSession(s.id)}>
                <div className="ri-title">{s.title || '(无标题)'}</div>
                <div className="ri-meta">{s.message_count} msg · {formatTime(s.last_activity_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, cls = '',
}: { icon: string; label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className={`stat-card ${cls}`}>
      <span className="stat-icon">{icon}</span>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ================================================================
   Conversation View
   ================================================================ */
function ConversationView({ session, messages, onViewRaw, jumpToMsgId, onJumpHandled }: {
  session: Session;
  messages: Message[];
  onViewRaw: (t: string, d: any) => void;
  jumpToMsgId: number | null;
  onJumpHandled: () => void;
}) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  // 加载当前会话的系统提示词
  useEffect(() => {
    let cancelled = false;
    setSystemPrompt(null);
    api.getSystemPromptBySession(session.id).then(p => {
      if (!cancelled) setSystemPrompt(p);
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [session.id]);

  // 构造系统提示词消息（序号 #0）
  const sysMsg: Message | null = systemPrompt
    ? {
      id: -1,
      session_id: session.id,
      role: 'system',
      content: systemPrompt,
      tool_calls: '',
      tool_call_id: '',
      name: '',
      reasoning_content: '',
      created_at: session.started_at || 0,
      token_count: 0,
      model: '',
      stop_reason: '',
    }
    : null;

  const allMessages = sysMsg ? [sysMsg, ...messages] : messages;

  return (
    <div className="conv-wrapper">
      <div className="conv-header">
        <div className="conv-title">
          {session.title || '(无标题)'}
          <span
            className="conv-id"
            title="点击复制会话 ID"
            onClick={() => {
              navigator.clipboard.writeText(session.id);
            }}
          >
            #{session.id}
          </span>
        </div>
        <div className="conv-meta">
          <span>💬 <strong>{session.message_count}</strong> 消息</span>
          <span>🔧 <strong>{session.tool_call_count}</strong> 工具调用</span>
          <span>🔁 <strong>{session.api_call_count ?? 0}</strong> API 调用</span>
          <span>📊 <strong>{formatSizeNoB(session.input_tokens + session.output_tokens)}</strong></span>
          {session.model && <span>🤖 <strong>{session.model}</strong></span>}
        </div>
      </div>

      <div className="conv-body">
        <MessageList messages={allMessages} onViewRaw={onViewRaw} jumpToMsgId={jumpToMsgId} onJumpHandled={onJumpHandled} />
      </div>
    </div>
  );
}

/* ---- Shared: parse tool calls ---- */
function parseToolCalls(raw: string): any[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

/* ---- Shared: tool calls block ---- */
function ToolCallsBlock({
  toolCalls,
  openState,
  onToggle,
  onToolCallIdClick,
  compact,
  keyPrefix,
}: {
  toolCalls: any[];
  openState: Record<string, boolean>;
  onToggle: (key: string) => void;
  onToolCallIdClick?: (id: string) => void;
  compact?: boolean;
  keyPrefix?: string;
}) {
  const prefix = keyPrefix ? `${keyPrefix}-` : '';
  return (
    <div className="msg-mini-tool">
      {toolCalls.map((tc: any, i: number) => {
        const fn = tc.function || tc;
        const name = fn.name || `tool_${i}`;
        let argsStr = fn.arguments || '';
        try {
          if (typeof argsStr === 'string' && argsStr) {
            argsStr = JSON.stringify(JSON.parse(argsStr), null, 2);
          }
        } catch { /* keep raw */ }
        const toolKey = `${prefix}${i}`;
        const isOpen = openState[toolKey];
        return (
          <div key={tc.id || i} style={{ marginBottom: i < toolCalls.length - 1 ? (compact ? 6 : 8) : 0 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 0', flexWrap: 'wrap' }}
              onClick={() => onToggle(toolKey)}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 12 }}>{isOpen ? '▼' : '▶'}</span>
              <span style={{ fontWeight: 600, color: 'var(--warning)' }}>🔧 {name}</span>
              {tc.id && (
                <span
                  className="tcid-chip"
                  onClick={onToolCallIdClick ? (e) => { e.stopPropagation(); onToolCallIdClick(tc.id); } : undefined}
                  style={{ cursor: onToolCallIdClick ? 'pointer' : 'default' }}
                  title={onToolCallIdClick ? '跳转到工具结果' : tc.id}
                >
                  {tc.id}
                </span>
              )}
              {argsStr && !isOpen && (
                <span style={{
                  fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: compact ? 200 : 280,
                }}>{argsStr.replace(/\n/g, ' ').substring(0, 80)}...</span>
              )}
            </div>
            {isOpen && argsStr && (
              <pre style={{
                margin: '4px 0 0 18px', fontSize: 11, lineHeight: 1.5,
                color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                wordBreak: 'break-all', maxHeight: compact ? 200 : 300, overflow: 'auto',
                fontFamily: 'var(--font-mono)', padding: '8px 10px',
                background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}>{argsStr}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Message List ---- */
function MessageList({ messages, onViewRaw, jumpToMsgId, onJumpHandled }: {
  messages: Message[];
  onViewRaw: (t: string, d: any) => void;
  jumpToMsgId: number | null;
  onJumpHandled: () => void;
}) {
  const [showReasoning, setShowReasoning] = useState<Record<number, boolean>>({});
  const [openToolDetails, setOpenToolDetails] = useState<Record<string, boolean>>({});
  const [expandedContent, setExpandedContent] = useState<Record<number, boolean>>({});
  // 每个轮次 id(用用户消息 id 作 key) → 是否展开完整过程
  const [openTurns, setOpenTurns] = useState<Record<number, boolean>>({});

  // 外部跳转到指定消息：展开所在轮次并滚动到该消息
  useEffect(() => {
    if (jumpToMsgId == null) return;
    // 消息还没加载完（不包含目标），保留状态等下次加载
    if (!messages.some(m => m.id === jumpToMsgId)) return;
    // 找到包含该消息的轮次并展开
    let cur: Message[] = [];
    let targetTurn: Message[] | null = null;
    for (const m of messages) {
      const r = (m.role || '').toLowerCase();
      if (m.id === -1 || r === 'user') {
        if (targetTurn) break;
        cur = [m];
      } else {
        cur.push(m);
      }
      if (m.id === jumpToMsgId) targetTurn = cur;
    }
    if (targetTurn) {
      const leadId = targetTurn[0].id;
      setOpenTurns(o => ({ ...o, [leadId]: true }));
      // 等轮次展开渲染完成后滚动
      setTimeout(() => {
        const el = document.getElementById(`msg-${jumpToMsgId}`);
        const convBody = document.querySelector('.conv-body');
        if (el && convBody) {
          const elRect = el.getBoundingClientRect();
          const bodyRect = convBody.getBoundingClientRect();
          convBody.scrollTo({ top: elRect.top - bodyRect.top + convBody.scrollTop - 8, behavior: 'auto' });
          el.style.transition = 'box-shadow 0.3s';
          el.style.boxShadow = '0 0 0 2px var(--accent)';
          setTimeout(() => { el.style.boxShadow = 'none'; }, 1800);
        }
      }, 200);
    }
    onJumpHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToMsgId, messages]);

  if (messages.length === 0) {
    return <EmptyState icon="💭" title="暂无消息" desc="该会话没有消息记录" />;
  }

  function toggleTool(key: string) {
    setOpenToolDetails(o => ({ ...o, [key]: !o[key] }));
  }

  // 滚动到指定消息（高亮闪烁）
  function scrollToMsg(id: number) {
    const el = document.getElementById(`msg-${id}`);
    const convBody = document.querySelector('.conv-body');
    if (!el) return;
    if (convBody) {
      const elRect = el.getBoundingClientRect();
      const bodyRect = convBody.getBoundingClientRect();
      convBody.scrollTo({ top: elRect.top - bodyRect.top + convBody.scrollTop - 8, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    el.style.transition = 'box-shadow 0.3s';
    el.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { el.style.boxShadow = 'none'; }, 1500);
  }

  // 找到包含某 tool_call_id 的 assistant 消息（工具调用发起者）
  function findToolCallerId(toolCallId: string): number | null {
    const caller = messages.find(m => {
      const tcs = parseToolCalls(m.tool_calls);
      return tcs.some((tc: any) => tc.id === toolCallId);
    });
    return caller ? caller.id : null;
  }

  // 找到某 tool_call_id 对应的 tool 结果消息
  function findToolResultId(toolCallId: string): number | null {
    const result = messages.find(m => m.tool_call_id === toolCallId);
    return result ? result.id : null;
  }

  // 按 user 消息切分为轮次（turn）
  // 每条 user 消息开启一个轮次；其后的 assistant/tool 属于该轮，直到下一条 user
  // 系统提示词(id=-1)单独成一个特殊轮次
  const turns: Message[][] = [];
  let curTurn: Message[] = [];
  for (const m of messages) {
    const r = (m.role || '').toLowerCase();
    // 系统提示词或新用户消息：开启新轮次
    if (m.id === -1 || r === 'user') {
      if (curTurn.length > 0) turns.push(curTurn);
      curTurn = [m];
    } else {
      curTurn.push(m);
    }
  }
  if (curTurn.length > 0) turns.push(curTurn);

  return (
    <div className="msg-card-list">
      {turns.map((turn) => {
        // 第一个消息为 user（或系统提示词）
        const lead = turn[0];
        const isSystemTurn = lead.id === -1;
        const turnKey = lead.id;
        const isOpen = !!openTurns[turnKey];

        // 该轮的工具调用次数：统计所有 assistant 消息里 tool_calls 数组的元素总数
        const toolCount = turn.reduce((acc, m) => {
          const r = (m.role || '').toLowerCase();
          if (r === 'assistant') {
            acc += parseToolCalls(m.tool_calls).length;
          }
          return acc;
        }, 0);
        // 该轮最后一条纯文本 assistant 回答（无工具调用）
        const finalAnswer = [...turn].reverse().find(m =>
          (m.role || '').toLowerCase() === 'assistant'
          && !parseToolCalls(m.tool_calls).length
          && (m.content || '').trim()
        );
        // 非 user 消息（工具过程）数量：减去 user 和最终回答（两者在折叠时都显示）
        const processCount = turn.length - 1 - (finalAnswer ? 1 : 0);

        // 系统提示词轮次：直接展开显示
        if (isSystemTurn) {
          return (
            <div key={turnKey} className="turn-group">
              <TurnHeader isOpen={true} lead={lead}
                toolCount={toolCount} processCount={processCount}
                onToggle={() => {}} canToggle={false} />
              <div className="turn-body">
                {turn.map(m => (
                  <MessageCard key={m.id} msg={m} onViewRaw={onViewRaw}
                    showReasoning={showReasoning} setShowReasoning={setShowReasoning}
                    openToolDetails={openToolDetails} toggleTool={toggleTool}
                    expandedContent={expandedContent} setExpandedContent={setExpandedContent}
                    scrollToMsg={scrollToMsg} findToolCallerId={findToolCallerId}
                    findToolResultId={findToolResultId}
                  />
                ))}
              </div>
            </div>
          );
        }

        // 普通轮次：折叠时只显示 user + 最终回答
        return (
          <div key={turnKey} className="turn-group">
            <TurnHeader isOpen={isOpen} lead={lead}
              toolCount={toolCount} processCount={processCount}
              onToggle={() => setOpenTurns(o => ({ ...o, [turnKey]: !o[turnKey] }))}
              canToggle={processCount > 0} />
            <div className="turn-body">
              {/* 始终显示用户消息 */}
              <MessageCard key={lead.id} msg={lead} onViewRaw={onViewRaw}
                showReasoning={showReasoning} setShowReasoning={setShowReasoning}
                openToolDetails={openToolDetails} toggleTool={toggleTool}
                expandedContent={expandedContent} setExpandedContent={setExpandedContent}
                scrollToMsg={scrollToMsg} findToolCallerId={findToolCallerId}
                findToolResultId={findToolResultId}
              />
              {/* 折叠时只显示最终回答 */}
              {!isOpen && finalAnswer && (
                <MessageCard key={finalAnswer.id} msg={finalAnswer} onViewRaw={onViewRaw}
                  showReasoning={showReasoning} setShowReasoning={setShowReasoning}
                  openToolDetails={openToolDetails} toggleTool={toggleTool}
                  expandedContent={expandedContent} setExpandedContent={setExpandedContent}
                  scrollToMsg={scrollToMsg} findToolCallerId={findToolCallerId}
                  findToolResultId={findToolResultId}
                />
              )}
              {/* 折叠时：如果有工具过程被隐藏，显示醒目的展开提示条 */}
              {!isOpen && processCount > 0 && (
                <div className="turn-more" onClick={() => setOpenTurns(o => ({ ...o, [turnKey]: !o[turnKey] }))}>
                  <span className="turn-more-dots">···</span>
                  <span className="turn-more-text">
                    <span className="turn-more-fade">中间还进行了</span>
                    <span className="turn-more-count">{toolCount} 次工具调用</span>
                  </span>
                  <span className="turn-more-btn">查看完整过程 ▾</span>
                </div>
              )}
              {/* 展开时显示完整过程 */}
              {isOpen && turn.slice(1).map(m => (
                <MessageCard key={m.id} msg={m} onViewRaw={onViewRaw}
                  showReasoning={showReasoning} setShowReasoning={setShowReasoning}
                  openToolDetails={openToolDetails} toggleTool={toggleTool}
                  expandedContent={expandedContent} setExpandedContent={setExpandedContent}
                  scrollToMsg={scrollToMsg} findToolCallerId={findToolCallerId}
                  findToolResultId={findToolResultId}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- 轮次头部（折叠/展开控制） ---- */
function TurnHeader({ isOpen, lead, toolCount, processCount, onToggle, canToggle }: {
  isOpen: boolean;
  lead: Message;
  toolCount: number;
  processCount: number;
  onToggle: () => void;
  canToggle: boolean;
}) {
  if (lead.id === -1) {
    // 系统提示词头部（不可折叠）
    return (
      <div className="turn-header system">
        <span className="turn-chevron">•</span>
        <span className="turn-title">🧠 系统提示词</span>
        <span className="turn-meta">{(lead.content || '').length.toLocaleString()} chars</span>
      </div>
    );
  }
  // 中间无内容的轮次：静态标题，不可点击展开/收缩（箭头用 •，与系统提示词一致）
  if (!canToggle) {
    return (
      <div className="turn-header static">
        <span className="turn-chevron">•</span>
        <span className="turn-title">
          {lead.content ? (lead.content.slice(0, 60) + (lead.content.length > 60 ? '…' : '')) : '(空消息)'}
        </span>
        <span className="turn-meta">{formatTime(lead.created_at)}</span>
      </div>
    );
  }
  return (
    <div className="turn-header" onClick={onToggle}>
      <span className="turn-chevron">{isOpen ? '▼' : '▶'}</span>
      <span className="turn-title">
        {lead.content ? (lead.content.slice(0, 60) + (lead.content.length > 60 ? '…' : '')) : '(空消息)'}
      </span>
      {toolCount > 0 && <span className="turn-badge">🔧 {toolCount} 次工具调用</span>}
      <span className="turn-meta">{formatTime(lead.created_at)}</span>
      {processCount > 0 && (
        <span className={`turn-action ${isOpen ? 'open' : ''}`}>
          {isOpen ? '收起过程 ▴' : `展开 ${processCount} 条过程 ▾`}
        </span>
      )}
    </div>
  );
}

/* ---- 单条消息卡片（复用原渲染逻辑） ---- */
function MessageCard({ msg, onViewRaw, showReasoning, setShowReasoning,
  openToolDetails, toggleTool, expandedContent, setExpandedContent,
  scrollToMsg, findToolCallerId, findToolResultId }: {
  msg: Message;
  onViewRaw: (t: string, d: any) => void;
  showReasoning: Record<number, boolean>;
  setShowReasoning: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  openToolDetails: Record<string, boolean>;
  toggleTool: (key: string) => void;
  expandedContent: Record<number, boolean>;
  setExpandedContent: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  scrollToMsg: (id: number) => void;
  findToolCallerId: (toolCallId: string) => number | null;
  findToolResultId: (toolCallId: string) => number | null;
}) {
  const r = (msg.role || '').toLowerCase();
  const hasReasoning = !!msg.reasoning_content;
  const isReasoningOpen = !!showReasoning[msg.id];
  const toolCalls = parseToolCalls(msg.tool_calls);
  const charCount = (msg.content || '').length;
  const isSystem = msg.id === -1;
  const seq = isSystem ? 0 : msg.id;
  const LONG = 600;
  const isLong = charCount > LONG;
  const isExpanded = !!expandedContent[msg.id];
  const shownContent = isLong && !isExpanded ? msg.content.slice(0, LONG) + '…' : msg.content;

  return (
    <div key={msg.id} id={`msg-${msg.id}`} className="msg-mini msg-card">
      <div className="msg-mini-head">
        <span className={`msg-mini-role ${r}`}>{msg.role}</span>
        <span>#{seq}</span>
        <span>· {charCount.toLocaleString()} chars</span>
        <span>· {formatTime(msg.created_at)}</span>
        {msg.token_count > 0 && <span>· {msg.token_count} tokens</span>}
        {msg.name && <span>· {msg.name}</span>}
      </div>

      {r === 'tool' && msg.tool_call_id && (
        <div className="msg-mini-tool" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>↩ {msg.name || 'tool'}:</span>
          <span
            className="tcid-chip"
            onClick={() => {
              const callerId = findToolCallerId(msg.tool_call_id!);
              if (callerId != null) scrollToMsg(callerId);
            }}
            style={{ cursor: 'pointer' }}
            title="跳转到工具调用"
          >
            {msg.tool_call_id}
          </span>
        </div>
      )}

      {hasReasoning && (
        <>
          <button className="chat-reasoning-toggle" onClick={() => setShowReasoning(s => ({ ...s, [msg.id]: !s[msg.id] }))}>
            {isReasoningOpen ? '▼' : '▶'} 🧠 推理过程
          </button>
          {isReasoningOpen && <div className="chat-reasoning">{msg.reasoning_content}</div>}
        </>
      )}

      {msg.content && <div className="msg-mini-body">{shownContent}</div>}
      {!msg.content && !hasReasoning && toolCalls.length === 0 && (
        <div className="msg-mini-body" style={{ fontStyle: 'italic', opacity: 0.5 }}>(空消息)</div>
      )}

      {isLong && (
        <button className="chip" style={{ marginTop: 8 }} onClick={() => setExpandedContent(s => ({ ...s, [msg.id]: !s[msg.id] }))}>
          {isExpanded ? '▲ 收起' : `▼ 展开全文 (${charCount.toLocaleString()} chars)`}
        </button>
      )}

      {toolCalls.length > 0 && (
        <ToolCallsBlock
          toolCalls={toolCalls}
          openState={openToolDetails}
          onToggle={toggleTool}
          onToolCallIdClick={(id) => {
            const resultId = findToolResultId(id);
            if (resultId != null) scrollToMsg(resultId);
          }}
          keyPrefix={`m-${msg.id}`}
        />
      )}

      <div className="chat-actions">
        <button className="chip" onClick={() => onViewRaw(`消息 #${msg.id}`, {
          id: msg.id, role: msg.role, content: msg.content,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          tool_call_id: msg.tool_call_id || undefined,
          name: msg.name || undefined,
          reasoning_content: msg.reasoning_content || undefined,
          created_at: msg.created_at, token_count: msg.token_count,
        })}>📋 原始数据</button>
      </div>
    </div>
  );
}

/* ================================================================
   Schema Page
   ================================================================ */
function SchemaPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    api.listTables().then(t => {
      setTables(t);
      if (t.length > 0) setSelected(t[0].name);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.getTableInfo(selected).then(setDetail).catch(() => { });
  }, [selected]);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">数据库表结构</div>
        <div className="page-subtitle">浏览表结构、字段、索引和示例数据</div>
      </div>
      <div className="schema-layout">
        <div className="table-list">
          {tables.map(t => (
            <div key={t.name} className={`table-list-item ${selected === t.name ? 'active' : ''}`} onClick={() => setSelected(t.name)}>
              <span>{t.name}</span>
              <span className="tli-count">{t.rows}</span>
            </div>
          ))}
        </div>
        <div className="table-detail">
          {detail && (
            <>
              <div className="schema-section">
                <div className="schema-section-title">字段 ({detail.columns.length})</div>
                {detail.columns.map((col: any) => (
                  <div key={col.cid} className="schema-col">
                    <span className="col-name">{col.name}</span>
                    <span className="col-type">{col.type}</span>
                    <div className="col-flags">
                      {col.pk ? <span className="flag pk">PK</span> : null}
                      {col.notnull ? <span className="flag nn">NOT NULL</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              {detail.indexes.length > 0 && (
                <div className="schema-section">
                  <div className="schema-section-title">索引 ({detail.indexes.length})</div>
                  {detail.indexes.map((idx: any, i: number) => (
                    <div key={i} className="schema-col" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <span className="col-name" style={{ width: 'auto', minWidth: 200 }}>{idx.name}</span>
                      <span className="col-type" style={{ width: 'auto' }}>
                        {idx.unique ? 'UNIQUE' : 'INDEX'}
                        {idx.origin === 'pk' ? ' · PK' : idx.origin === 'u' ? ' · UNIQUE' : ''}
                        {idx.partial ? ' · PARTIAL' : ''}
                      </span>
                      {idx.columns?.length > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          ({idx.columns.join(', ')})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {detail.sample_rows.length > 0 && (
                <div className="schema-section">
                  <div className="schema-section-title">示例数据 ({detail.sample_rows.length} 行)</div>
                  <div className="result-wrap" style={{ maxHeight: 300 }}>
                    <table className="result-table">
                      <thead>
                        <tr>{Object.keys(detail.sample_rows[0]).map(k => <th key={k}>{k}</th>)}</tr>
                      </thead>
                      <tbody>
                        {detail.sample_rows.map((row: any, i: number) => (
                          <tr key={i}>
                            {Object.values(row).map((v: any, j: number) => (
                              <td key={j} title={String(v)}>{String(v ?? 'NULL')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SQL Page
   ================================================================ */
function SqlPage() {
  const [sql, setSql] = useState('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await api.executeSql(sql);
      setResult(r);
    } catch (e: any) {
      setResult({ error: e.message });
    }
    setLoading(false);
  }

  const quickQueries: Record<string, string> = {
    '最近会话': "SELECT id, title, message_count, input_tokens, output_tokens FROM sessions ORDER BY last_activity_at DESC LIMIT 20",
    'Token Top 10': "SELECT title, input_tokens + output_tokens as total FROM sessions ORDER BY total DESC LIMIT 10",
    '每日消息量': "SELECT date(timestamp, 'unixepoch') as d, COUNT(*) as cnt FROM messages GROUP BY d ORDER BY d DESC LIMIT 30",
    '工具调用统计': "SELECT tool_name, COUNT(*) as cnt FROM messages WHERE tool_name IS NOT NULL AND tool_name != '' GROUP BY tool_name ORDER BY cnt DESC LIMIT 20",
    '成本分布': "SELECT model, COUNT(*) as cnt, ROUND(SUM(estimated_cost_usd), 4) as cost FROM sessions GROUP BY model ORDER BY cost DESC",
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">SQL 查询</div>
        <div className="page-subtitle">直接查询 state.db，只读模式</div>
      </div>

      <div className="sql-toolbar">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(quickQueries).map(([label, q]) => (
            <button key={label} className="chip" onClick={() => setSql(q)}>{label}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={run} disabled={loading}>
          {loading ? '执行中...' : '▶ 执行 (Ctrl+Enter)'}
        </button>
      </div>

      <div className="sql-editor-wrap">
        <div className="sql-editor-toolbar">
          <span className="sql-hint">-- state.db</span>
        </div>
        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') run(); }}
          spellCheck={false}
        />
      </div>

      {result?.error && <div className="sql-error">❌ {result.error}</div>}

      {result?.columns && (
        <>
          <div className="result-meta">
            {result.rows.length} 行
          </div>
          <div className="result-wrap">
            <table className="result-table">
              <thead>
                <tr>{result.columns.map((c: string) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.map((row: any, i: number) => (
                  <tr key={i}>
                    {result.columns.map((c: string) => (
                      <td key={c} title={String(row[c])}>{String(row[c] ?? 'NULL')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================
   Settings Modal
   ================================================================ */
function SettingsModal({ onClose, dbMeta }: {
  onClose: () => void;
  dbMeta: { path?: string; size: number; name: string };
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">⚙️ 设置</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="settings-group">
            <div className="settings-label">📁 当前加载的数据库文件</div>
            <div className="db-status-card">
              <div className="dsc-head">
                <span className="dsc-name">state.db</span>
                <span className="dsc-size">{formatSize(dbMeta.size)}</span>
              </div>
              <div className="dsc-path">{dbMeta.path || '（未知路径）'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
