import { useState, useEffect, useCallback } from 'react';
import {
  api, whenReady, onProgress, formatSize, formatSizeNoB, formatTime,
} from './api';
import type { Session, Message, Summary, ApiCall } from './api';
import { useI18n } from './I18nContext';
import { JsonViewerModal } from './JsonTree';
import './styles.css';

type Page = 'dashboard' | 'sessions' | 'schema' | 'sql';

/* ---- Refresh icon (SVG), in a modern dark theme style ---- */
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
   Root component
   ================================================================ */
export default function App() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState('load.init');
  const [loadPercent, setLoadPercent] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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

  // Initialize: wait for the main process to load state.db
  useEffect(() => {
    whenReady().then(async () => {
      setReady(true);
      try {
        // Fetch the loaded db metadata from the Electron main process
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
        setLoadError(e?.message || 'Failed to load state.db');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search sessions
  const refreshSessions = useCallback(async () => {
    if (!api.isReady()) return;
    // If the input matches a #messageID format, skip session filtering (used to locate a message)
    const isMsgIdSearch = /^#?\d+$/.test(search.trim());
    const res = await api.listSessions({ limit: 100, q: isMsgIdSearch ? '' : search });
    setSessions(res.items);
    setTotalSessions(res.total);
  }, [search]);

  // Full refresh: reload state.db from disk, then refresh all data
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.reload();
      if (!res.ok) {
        setLoadError(res.error || 'Refresh failed');
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
      // Bump the refresh key so the open conversation's API-call panel and
      // system prompt reload along with the message list.
      setRefreshKey(k => k + 1);
      // Reload messages for the currently selected session so the open
      // conversation reflects the latest data (not just the list/summary).
      if (selectedId) {
        api.listMessages(selectedId).then(setMessages).catch(() => setMessages([]));
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Refresh failed');
    }
    setRefreshing(false);
  }, [search, selectedId]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // Load messages for the selected session
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    api.listMessages(selectedId).then(setMessages).catch(() => setMessages([]));
  }, [selectedId]);

  const selectedSession = sessions.find(s => s.id === selectedId);
  const showSessionPanel = page === 'sessions';

  function viewRawJson(title: string, data: any) {
    setJsonModal({ title, data });
  }

  // Handle Enter in the header search box: if input is #number, locate by message id
  async function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const val = search.trim();
    const m = val.match(/^#?(\d+)$/);
    if (!m) return; // non-numeric input falls through to a normal session search
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
    { id: 'dashboard', icon: '📊', label: t('nav.overview') },
    { id: 'sessions', icon: '💬', label: t('nav.sessions') },
    { id: 'schema', icon: '🗄️', label: t('nav.schema') },
    { id: 'sql', icon: '🔍', label: t('nav.sql') },
  ];

  // Loading / initial screen
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
          <div style={{ fontSize: 12, marginBottom: 6 }}>{t(loading)}</div>
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
      {/* Header — custom-drawn title bar */}
      <header className="header">
        <div className="header-logo no-drag">
          <span className="logo-icon">⚡</span> StateDB Explorer
        </div>
        <div className="header-search no-drag">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('app.search')}
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
            title={t('nav.settings')}
            onClick={() => setShowSettings(true)}
          >
            <span>⚙️</span>
            <span className="rail-label">{t('nav.settings')}</span>
          </button>
        </nav>

        {/* Session List Panel */}
        {showSessionPanel && (
          <aside className="sub-panel">
            <div className="panel-header">
              <div className="panel-title">{t('sessions.title')}</div>
              <div className="panel-subtitle">{t('sessions.count', { count: totalSessions })}</div>
            </div>
            <div className="session-list">
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`session-item ${selectedId === s.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="session-title">{s.title || t('turn.emptyTitle')}</div>
                  <div className="session-meta">
                    <span>{t('sessions.messages', { n: s.message_count })}</span>
                    <span className="dot" />
                    <span>{t('sessions.calls', { n: s.api_call_count ?? 0 })}</span>
                    <span className="dot" />
                    <span>{formatSizeNoB(s.input_tokens + s.output_tokens)}</span>
                    <span className="dot" />
                    <span>{formatTime(s.last_activity_at)}</span>
                  </div>
                </div>
              ))}
              {sessions.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)' }}>{t('sessions.empty')}</div>
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
              refreshKey={refreshKey}
            />
          )}
          {page === 'sessions' && !selectedSession && (
            <EmptyState icon="💬" title={t('conv.noSession')} desc={t('conv.noMessages')} />
          )}
          {page === 'schema' && <SchemaPage />}
          {page === 'sql' && <SqlPage />}
        </main>
      </div>

      {/* Footer */}
      <footer className="footer">
        <span>{t('status.db', { size: summary ? formatSize(summary.db_size) : '—' })}</span>
        <span>{t('status.sessions', { n: totalSessions })}</span>
        <span>{t('status.messages', { n: summary?.messages ?? 0 })}</span>
        <span className="footer-right">
          <button
            className="panel-refresh"
            onClick={handleRefresh}
            title={t('app.refresh')}
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
  const { t } = useI18n();
  if (!summary) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('overview.loading')}</div>;

  const avgTokens = summary.sessions > 0 ? Math.round(summary.total_tokens / summary.sessions) : 0;
  const topSessions = [...sessions]
    .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
    .slice(0, 6);
  const maxTokens = Math.max(...topSessions.map(s => s.input_tokens + s.output_tokens), 1);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{t('overview.title')}</div>
        <div className="page-subtitle">{t('overview.subtitle')}</div>
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard icon="💬" label={t('overview.totalSessions')} value={summary.sessions.toLocaleString()} cls="accent"
          sub={t('overview.messagesSuffix', { n: summary.messages.toLocaleString() })} />
        <StatCard icon="📊" label={t('overview.totalTokens')} value={formatSizeNoB(summary.total_tokens)} cls="teal"
          sub={t('overview.avgTokens', { v: formatSizeNoB(avgTokens) })} />
        <StatCard icon="🧠" label={t('overview.systemPrompts')} value={summary.system_prompts.toLocaleString()} cls="purple" sub={t('overview.systemPrompts')} />
        <StatCard icon="🕐" label={t('overview.recentActive')} value={sessions.length > 0 ? formatTime(sessions[0].last_activity_at) : '—'} cls="purple" />
      </div>

      <div className="dash-cards-row">
        <div className="dash-card">
          <div className="dash-card-title">{t('overview.tokenTop')}</div>
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
          <div className="dash-card-title">{t('overview.recentSessions')}</div>
          <div className="recent-list">
            {sessions.slice(0, 8).map(s => (
              <div key={s.id} className="recent-item" onClick={() => onSelectSession(s.id)}>
                <div className="ri-title">{s.title || t('turn.emptyTitle')}</div>
                <div className="ri-meta">{t('overview.messagesSuffix', { n: s.message_count })} · {formatTime(s.last_activity_at)}</div>
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
function ConversationView({ session, messages, onViewRaw, jumpToMsgId, onJumpHandled, refreshKey }: {
  session: Session;
  messages: Message[];
  onViewRaw: (t: string, d: any) => void;
  jumpToMsgId: number | null;
  onJumpHandled: () => void;
  refreshKey: number;
}) {
  const { t } = useI18n();
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [apiCalls, setApiCalls] = useState<ApiCall[]>([]);
  const [hookAvailable, setHookAvailable] = useState(false);
  const [apiPanelOpen, setApiPanelOpen] = useState(false);

  // Load the system prompt for the current session
  useEffect(() => {
    let cancelled = false;
    setSystemPrompt(null);
    api.getSystemPromptBySession(session.id).then(p => {
      if (!cancelled) setSystemPrompt(p);
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [session.id]);

  // Load API request/response records for this session (from api_hook.db).
  // Reloads when the session changes or after a refresh (refreshKey bump).
  useEffect(() => {
    let cancelled = false;
    api.hookAvailable().then(av => {
      if (!cancelled) setHookAvailable(av);
    }).catch(() => { });
    api.listApiCalls(session.id).then(res => {
      if (!cancelled) { setApiCalls(res.rows); if (res.available) setHookAvailable(true); }
    }).catch(() => { });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, refreshKey]);

  // Build the system-prompt message (index #0)
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
          {session.title || t('turn.emptyTitle')}
          <span
            className="conv-id"
            title={t('conv.copyId')}
            onClick={() => {
              navigator.clipboard.writeText(session.id);
            }}
          >
            #{session.id}
          </span>
        </div>
        <div className="conv-meta">
          <span>💬 <strong>{session.message_count}</strong> {t('conv.messages')}</span>
          <span>🔧 <strong>{session.tool_call_count}</strong> {t('conv.toolCalls')}</span>
          <span>🔁 <strong>{session.api_call_count ?? 0}</strong> {t('conv.apiCalls')}</span>
          <span>📊 <strong>{formatSizeNoB(session.input_tokens + session.output_tokens)}</strong></span>
          {session.model && <span>🤖 <strong>{session.model}</strong></span>}
        </div>
      </div>

      {/* API request/response panel (from api_hook.db) */}
      <ApiCallsPanel
        calls={apiCalls}
        available={hookAvailable}
        open={apiPanelOpen}
        onToggle={() => setApiPanelOpen(o => !o)}
        onViewRaw={onViewRaw}
      />

      <div className="conv-body">
        <MessageList messages={allMessages} onViewRaw={onViewRaw} jumpToMsgId={jumpToMsgId} onJumpHandled={onJumpHandled} />
      </div>
    </div>
  );
}

/* ---- API request/response panel ---- */
function ApiCallsPanel({ calls, available, open, onToggle, onViewRaw }: {
  calls: ApiCall[];
  available: boolean;
  open: boolean;
  onToggle: () => void;
  onViewRaw: (t: string, d: any) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!available) {
    return (
      <div className="api-panel api-panel-empty">
        <span className="api-panel-hint">{t('api.notAvailable')}</span>
      </div>
    );
  }

  // Tally usage across all calls for the panel summary
  const totalUsage = calls.reduce((acc, c) => {
    const u = parseUsage(c.usage);
    acc.input += u.input;
    acc.output += u.output;
    acc.cache += u.cache;
    acc.prompt += u.prompt;
    acc.total += u.total;
    return acc;
  }, { input: 0, output: 0, cache: 0, prompt: 0, total: 0 });
  const totalHitRate = cacheHitRate(totalUsage);

  return (
    <div className={`api-panel ${open ? 'open' : ''}`}>
      <div className="api-panel-header" onClick={onToggle}>
        <Chevron open={open} />
        <span className="api-panel-title">🌐 {t('api.title')}</span>
        <span className="api-panel-count">{t('api.count', { n: calls.length })}</span>
        {calls.length > 0 && (
          <span className="api-panel-usage">
            <span className="usage-seg usage-in" title={t('api.tooltipInput')}>↑ {formatSizeNoB(totalUsage.input)}</span>
            <span className="usage-seg usage-out" title={t('api.tooltipOutput')}>↓ {formatSizeNoB(totalUsage.output)}</span>
            <span className="usage-seg usage-cache" title={t('api.tooltipCache')}>◎ {formatSizeNoB(totalUsage.cache)}</span>
            {totalHitRate != null && (
              <span
                className={`usage-seg usage-hit ${totalHitRate > 0.8 ? 'good' : totalHitRate > 0.5 ? 'mid' : 'low'}`}
                title={t('api.tooltipHitRate')}
              >
                ◎ {Math.round(totalHitRate * 100)}%
              </span>
            )}
          </span>
        )}
      </div>
      {open && (
        <div className="api-panel-body">
          {calls.length === 0 && (
            <div className="api-panel-empty-text">{t('api.empty')}</div>
          )}
          {calls.map(c => {
            const isExp = !!expanded[c.api_request_id];
            const usage = parseUsage(c.usage);
            const status = callStatus(c);
            return (
              <div key={c.api_request_id} className={`api-call ${isExp ? 'open' : ''}`}>
                <div
                  className="api-call-header"
                  onClick={() => setExpanded(e => ({ ...e, [c.api_request_id]: !e[c.api_request_id] }))}
                >
                  <span className={`api-call-dot status-${status}`} title={status} />
                  <Chevron open={isExp} size={8} />
                  <div className="api-call-main">
                    <span className="api-call-model">{c.model || '—'}</span>
                    {c.provider && <span className="api-call-provider">{c.provider}</span>}
                  </div>
                  <span className="api-call-usage">
                    <span className="usage-seg usage-in">{formatSizeNoB(usage.input)}</span>
                    <span className="usage-seg usage-out">{formatSizeNoB(usage.output)}</span>
                  </span>
                  {c.retry_count > 0 && (
                    <span className="api-call-retry">{t('api.retry', { n: c.retry_count })}</span>
                  )}
                  <span className="api-call-time">{formatTime(c.started_at)}</span>
                  {c.message_id != null && (
                    <span className="api-call-msg">→ msg #{c.message_id}</span>
                  )}
                </div>
                {isExp && (
                  <div className="api-call-body">
                    <div className="api-call-meta-grid">
                      {c.finish_reason && (
                        <div className="api-call-meta">
                          <span className="api-call-meta-label">{t('api.finishReason')}</span>
                          <span className="api-call-meta-value">{c.finish_reason}</span>
                        </div>
                      )}
                      {c.response_model && (
                        <div className="api-call-meta">
                          <span className="api-call-meta-label">{t('api.responseModel')}</span>
                          <span className="api-call-meta-value">{c.response_model}</span>
                        </div>
                      )}
                      {usage.total > 0 && (
                        <div className="api-call-meta">
                          <span className="api-call-meta-label">{t('api.tokens')}</span>
                          <span className="api-call-meta-value">
                            {t('api.tokenDetail', { i: formatSizeNoB(usage.input), o: formatSizeNoB(usage.output), c: formatSizeNoB(usage.cache) })}
                            {(() => {
                              const hit = cacheHitRate(usage);
                              return hit != null
                                ? <span className={`usage-hit ${hit > 0.8 ? 'good' : hit > 0.5 ? 'mid' : 'low'}`} title={t('api.tooltipHitRate')}> · {t('api.cacheHit', { pct: Math.round(hit * 100) })}</span>
                                : null;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="api-call-actions">
                      {c.request && (
                        <button
                          className="api-call-view"
                          onClick={() => {
                            try { onViewRaw(t('api.request'), JSON.parse(c.request!)); }
                            catch { onViewRaw(t('api.request'), c.request); }
                          }}
                        >
                          {t('api.request')} · {t('api.viewJson')}
                        </button>
                      )}
                      {c.response && (
                        <button
                          className="api-call-view"
                          onClick={() => {
                            try { onViewRaw(t('api.response'), JSON.parse(c.response!)); }
                            catch { onViewRaw(t('api.response'), c.response); }
                          }}
                        >
                          {t('api.response')} · {t('api.viewJson')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---- Helpers for the API panel ---- */

interface UsageBreakdown {
  input: number;   // tokens that missed the prompt cache (charged at normal rate)
  output: number;  // completion tokens
  cache: number;   // tokens served from the prompt cache (cheaper)
  total: number;   // total_tokens as reported by the provider
  prompt: number;  // input + cache (full prompt size)
}

/** Parse the JSON usage field into input/output/cache/total token counts. */
function parseUsage(raw: string | null): UsageBreakdown {
  const empty: UsageBreakdown = { input: 0, output: 0, cache: 0, total: 0, prompt: 0 };
  if (!raw) return empty;
  try {
    const u = JSON.parse(raw);
    const input = u.input_tokens ?? 0;
    const cache = u.cache_read_tokens ?? 0;
    return {
      input,
      output: u.output_tokens ?? 0,
      cache,
      total: u.total_tokens ?? 0,
      prompt: u.prompt_tokens ?? (input + cache),
    };
  } catch {
    return empty;
  }
}

/** Cache hit rate 0..1 (undefined when there is no cacheable prompt). */
function cacheHitRate(u: UsageBreakdown): number | undefined {
  if (u.prompt <= 0) return undefined;
  return Math.min(1, u.cache / u.prompt);
}

/** Derive a coarse status for a call: ok / error / retried. */
function callStatus(c: ApiCall): 'ok' | 'error' | 'retried' {
  const fr = (c.finish_reason || '').toLowerCase();
  if (fr === 'stop' || fr === 'length' || fr === 'tool_calls') return 'ok';
  if (fr && fr !== 'stop') return 'error';
  if (c.retry_count > 0) return 'retried';
  return 'ok';
}

/* ---- Chevron (consistent Apple-style expand/collapse indicator) ---- */
// Collapsed -> points right (expandable); open -> rotates 90deg to point down.
function Chevron({ open, size = 9 }: { open?: boolean; size?: number }) {
  return (
    <span className={`chevron ${open ? 'open' : ''}`} style={{ width: size }}>
      <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
        <path d="M2.5 1 L7.5 5 L2.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
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
  const { t } = useI18n();
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
                  title={onToolCallIdClick ? t('msg.jumpToResult') : tc.id}
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
  const { t } = useI18n();
  const [showReasoning, setShowReasoning] = useState<Record<number, boolean>>({});
  const [openToolDetails, setOpenToolDetails] = useState<Record<string, boolean>>({});
  const [expandedContent, setExpandedContent] = useState<Record<number, boolean>>({});
  // For each turn id (keyed by the user message id) → whether the full process is expanded
  const [openTurns, setOpenTurns] = useState<Record<number, boolean>>({});

  // External jump to a specific message: expand its turn and scroll to it
  useEffect(() => {
    if (jumpToMsgId == null) return;
    // Messages not fully loaded yet (target absent); keep state until the next load
    if (!messages.some(m => m.id === jumpToMsgId)) return;
    // Find the turn containing the message and expand it
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
      // Wait for the turn to render expanded before scrolling
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
    return <EmptyState icon="💭" title={t('conv.noMessages')} desc={t('conv.noMessages')} />;
  }

  function toggleTool(key: string) {
    setOpenToolDetails(o => ({ ...o, [key]: !o[key] }));
  }

  // Scroll to a specific message (with a highlight flash)
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

  // Find the assistant message that initiated a given tool_call_id
  function findToolCallerId(toolCallId: string): number | null {
    const caller = messages.find(m => {
      const tcs = parseToolCalls(m.tool_calls);
      return tcs.some((tc: any) => tc.id === toolCallId);
    });
    return caller ? caller.id : null;
  }

  // Find the tool result message for a given tool_call_id
  function findToolResultId(toolCallId: string): number | null {
    const result = messages.find(m => m.tool_call_id === toolCallId);
    return result ? result.id : null;
  }

  // Split messages into turns by user message
  // Each user message starts a new turn; subsequent assistant/tool messages belong to it until the next user
  // The system prompt (id=-1) forms its own special turn
  const turns: Message[][] = [];
  let curTurn: Message[] = [];
  for (const m of messages) {
    const r = (m.role || '').toLowerCase();
    // System prompt or a new user message: start a new turn
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
        // First message is a user message (or system prompt)
        const lead = turn[0];
        const isSystemTurn = lead.id === -1;
        const turnKey = lead.id;
        const isOpen = !!openTurns[turnKey];

        // Tool call count for this turn: total elements across all assistant tool_calls arrays
        const toolCount = turn.reduce((acc, m) => {
          const r = (m.role || '').toLowerCase();
          if (r === 'assistant') {
            acc += parseToolCalls(m.tool_calls).length;
          }
          return acc;
        }, 0);
        // The last plain-text assistant reply in this turn (no tool calls)
        const finalAnswer = [...turn].reverse().find(m =>
          (m.role || '').toLowerCase() === 'assistant'
          && !parseToolCalls(m.tool_calls).length
          && (m.content || '').trim()
        );
        // Count of non-user (tool process) messages: subtract the user and final answer (both shown when collapsed)
        const processCount = turn.length - 1 - (finalAnswer ? 1 : 0);

        // System-prompt turn: show fully expanded
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

        // Normal turn: when collapsed, show only the user message and the final answer
        return (
          <div key={turnKey} className="turn-group">
            <TurnHeader isOpen={isOpen} lead={lead}
              toolCount={toolCount} processCount={processCount}
              onToggle={() => setOpenTurns(o => ({ ...o, [turnKey]: !o[turnKey] }))}
              canToggle={processCount > 0} />
            <div className="turn-body">
              {/* Always show the user message */}
              <MessageCard key={lead.id} msg={lead} onViewRaw={onViewRaw}
                showReasoning={showReasoning} setShowReasoning={setShowReasoning}
                openToolDetails={openToolDetails} toggleTool={toggleTool}
                expandedContent={expandedContent} setExpandedContent={setExpandedContent}
                scrollToMsg={scrollToMsg} findToolCallerId={findToolCallerId}
                findToolResultId={findToolResultId}
              />
              {/* When collapsed, show only the final answer */}
              {!isOpen && finalAnswer && (
                <MessageCard key={finalAnswer.id} msg={finalAnswer} onViewRaw={onViewRaw}
                  showReasoning={showReasoning} setShowReasoning={setShowReasoning}
                  openToolDetails={openToolDetails} toggleTool={toggleTool}
                  expandedContent={expandedContent} setExpandedContent={setExpandedContent}
                  scrollToMsg={scrollToMsg} findToolCallerId={findToolCallerId}
                  findToolResultId={findToolResultId}
                />
              )}
              {/* When collapsed and tool processes are hidden, show a prominent expand hint */}
              {!isOpen && processCount > 0 && (
                <div className="turn-more" onClick={() => setOpenTurns(o => ({ ...o, [turnKey]: !o[turnKey] }))}>
                  <span className="turn-more-dots">{t('turn.moreDots')}</span>
                  <span className="turn-more-text">
                    <span className="turn-more-fade">{t('turn.moreText')}</span>
                    <span className="turn-more-count">{t('turn.toolCalls', { n: toolCount })}</span>
                  </span>
                  <span className="turn-more-btn">{t('turn.viewMore')}</span>
                </div>
              )}
              {/* When expanded, show the full process */}
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

/* ---- Turn header (collapse/expand control) ---- */
function TurnHeader({ isOpen, lead, toolCount, processCount, onToggle, canToggle }: {
  isOpen: boolean;
  lead: Message;
  toolCount: number;
  processCount: number;
  onToggle: () => void;
  canToggle: boolean;
}) {
  const { t } = useI18n();
  if (lead.id === -1) {
    // System-prompt header (not collapsible)
    return (
      <div className="turn-header system">
        <span className="turn-chevron">•</span>
        <span className="turn-title">🧠 {t('turn.system')}</span>
        <span className="turn-meta">{t('turn.charCount', { n: (lead.content || '').length.toLocaleString() })}</span>
      </div>
    );
  }
  // Turn with no intermediate content: static title, not clickable (arrow is •, matching the system prompt)
  if (!canToggle) {
    return (
      <div className="turn-header static">
        <span className="turn-chevron">•</span>
        <span className="turn-title">
          {lead.content ? (lead.content.slice(0, 60) + (lead.content.length > 60 ? '…' : '')) : t('turn.emptyTitle')}
        </span>
        <span className="turn-meta">{formatTime(lead.created_at)}</span>
      </div>
    );
  }
  return (
    <div className="turn-header" onClick={onToggle}>
      <Chevron open={isOpen} />
      <span className="turn-title">
        {lead.content ? (lead.content.slice(0, 60) + (lead.content.length > 60 ? '…' : '')) : t('turn.emptyTitle')}
      </span>
      {toolCount > 0 && <span className="turn-badge">🔧 {t('turn.toolCalls', { n: toolCount })}</span>}
      <span className="turn-meta">{formatTime(lead.created_at)}</span>
      {processCount > 0 && (
        <span className={`turn-action ${isOpen ? 'open' : ''}`}>
          {isOpen ? t('turn.collapse') : t('turn.expand', { n: processCount })}
        </span>
      )}
    </div>
  );
}

/* ---- Individual message card (reusing the original rendering logic) ---- */
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
  const { t } = useI18n();
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
            title={t('msg.jumpToCall')}
          >
            {msg.tool_call_id}
          </span>
        </div>
      )}

      {hasReasoning && (
        <>
          <button className="chat-reasoning-toggle" onClick={() => setShowReasoning(s => ({ ...s, [msg.id]: !s[msg.id] }))}>
            {isReasoningOpen ? '▼' : '▶'} 🧠 {t('msg.reasoning')}
          </button>
          {isReasoningOpen && <div className="chat-reasoning">{msg.reasoning_content}</div>}
        </>
      )}

      {msg.content && <div className="msg-mini-body">{shownContent}</div>}
      {!msg.content && !hasReasoning && toolCalls.length === 0 && (
        <div className="msg-mini-body" style={{ fontStyle: 'italic', opacity: 0.5 }}>{t('msg.empty')}</div>
      )}

      {isLong && (
        <button className="chip" style={{ marginTop: 8 }} onClick={() => setExpandedContent(s => ({ ...s, [msg.id]: !s[msg.id] }))}>
          {isExpanded ? `▲ ${t('msg.collapse')}` : t('msg.expandFull', { n: charCount.toLocaleString() })}
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
        <button className="chip" onClick={() => onViewRaw(`${t('msg.rawData')} #${msg.id}`, {
          id: msg.id, role: msg.role, content: msg.content,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          tool_call_id: msg.tool_call_id || undefined,
          name: msg.name || undefined,
          reasoning_content: msg.reasoning_content || undefined,
          created_at: msg.created_at, token_count: msg.token_count,
        })}>📋 {t('msg.rawData')}</button>
      </div>
    </div>
  );
}

/* ================================================================
   Schema Page
   ================================================================ */
function SchemaPage() {
  const { t } = useI18n();
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
        <div className="page-title">{t('schema.title')}</div>
        <div className="page-subtitle">{t('schema.subtitle')}</div>
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
                <div className="schema-section-title">{t('schema.fields', { n: detail.columns.length })}</div>
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
                  <div className="schema-section-title">{t('schema.indexes', { n: detail.indexes.length })}</div>
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
                  <div className="schema-section-title">{t('schema.sample', { n: detail.sample_rows.length })}</div>
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
  const { t } = useI18n();
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
    [t('sql.qqRecent')]: "SELECT id, title, message_count, input_tokens, output_tokens FROM sessions ORDER BY last_activity_at DESC LIMIT 20",
    [t('sql.qqTokenTop')]: "SELECT title, input_tokens + output_tokens as total FROM sessions ORDER BY total DESC LIMIT 10",
    [t('sql.qqDaily')]: "SELECT date(timestamp, 'unixepoch') as d, COUNT(*) as cnt FROM messages GROUP BY d ORDER BY d DESC LIMIT 30",
    [t('sql.qqTools')]: "SELECT tool_name, COUNT(*) as cnt FROM messages WHERE tool_name IS NOT NULL AND tool_name != '' GROUP BY tool_name ORDER BY cnt DESC LIMIT 20",
    [t('sql.qqCost')]: "SELECT model, COUNT(*) as cnt, ROUND(SUM(estimated_cost_usd), 4) as cost FROM sessions GROUP BY model ORDER BY cost DESC",
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">{t('sql.title')}</div>
        <div className="page-subtitle">{t('sql.subtitle')}</div>
      </div>

      <div className="sql-toolbar">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(quickQueries).map(([label, q]) => (
            <button key={label} className="chip" onClick={() => setSql(q)}>{label}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={run} disabled={loading}>
          {loading ? t('sql.executing') : t('sql.execute')}
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
            {t('sql.rows', { n: result.rows.length })}
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
  const { t, lang, setLang } = useI18n();
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">⚙️ {t('settings.title')}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="settings-group">
            <div className="settings-label">{t('settings.language')}</div>
            <div className="settings-options">
              <button
                className={`chip ${lang === 'zh' ? 'chip-active' : ''}`}
                onClick={() => setLang('zh')}
              >{t('settings.langZh')}</button>
              <button
                className={`chip ${lang === 'en' ? 'chip-active' : ''}`}
                onClick={() => setLang('en')}
              >{t('settings.langEn')}</button>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-label">📁 {t('settings.loadedFile')}</div>
            <div className="db-status-card">
              <div className="dsc-head">
                <span className="dsc-name">state.db</span>
                <span className="dsc-size">{formatSize(dbMeta.size)}</span>
              </div>
              <div className="dsc-path">{dbMeta.path || t('settings.path')}</div>
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-label">{t('settings.about')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {t('settings.info')}<br />
              {t('settings.readonly')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
