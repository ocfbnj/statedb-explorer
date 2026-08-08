import { useState, useMemo, useRef, useEffect, Fragment } from 'react';

interface JsonTreeProps {
  data: any;
  initialExpanded?: boolean;
  maxExpandDepth?: number;
}

const STR_TRUNCATE = 500;

/** Recursively convert BigInt/TypedArray/function to safe plain JSON values */
function sanitize(value: any, depth = 0): any {
  try {
    if (depth > 30) return '[Max depth]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Uint8Array) return `<bytes: ${value.length}>`;
    if (Array.isArray(value)) return value.map(v => sanitize(v, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, any> = {};
      try {
        const keys = Object.keys(value);
        for (const k of keys) out[k] = sanitize(value[k], depth + 1);
      } catch {
        out._error = 'Cannot enumerate keys';
      }
      return out;
    }
    return String(value);
  } catch {
    return '[Unserializable]';
  }
}

/** Safe JSON.stringify that handles BigInt */
function safeStringify(value: any, indent?: number): string {
  return JSON.stringify(sanitize(value), (_key, v) =>
    typeof v === 'bigint' ? Number(v) : v, indent);
}

export function JsonTree({ data, initialExpanded = true, maxExpandDepth = 2 }: JsonTreeProps) {
  const safeData = useMemo(() => sanitize(data), [data]);
  const lineCounter = useRef(1);
  lineCounter.current = 1;

  const tree = useMemo(() => {
    lineCounter.current = 1;
    return renderNode(safeData, undefined, 0, initialExpanded, maxExpandDepth, true);
  }, [safeData, initialExpanded, maxExpandDepth]);

  function renderNode(obj: any, key: string | undefined, level: number, expanded: boolean, maxDepth: number, isLast: boolean): React.ReactNode {
    const lineNum = lineCounter.current++;
    const t = obj === null ? 'null' : typeof obj;
    const indent = '  '.repeat(level);
    const keyLabel = key !== undefined ? (
      <><span className="jt-key">"{key}"</span><span className="jt-colon">: </span></>
    ) : null;
    const comma = !isLast ? <span className="jt-comma">,</span> : null;

    if (t === 'undefined') {
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">{indent}{keyLabel}<span className="jt-null">undefined</span>{comma}</span>
        </div>
      );
    }

    if (t === 'string') {
      const str = obj as string;
      const truncated = str.length > STR_TRUNCATE && level > 0;
      const display = truncated ? str.substring(0, STR_TRUNCATE - 3) + '...' : str;
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">
            {indent}{keyLabel}
            <span className="jt-str">"{display}"</span>
            {truncated && (
              <span
                className="jt-ellipsis"
                onClick={(e) => { e.stopPropagation(); expandInlineString(e, str); }}
              >
                +{(str.length - STR_TRUNCATE + 3).toLocaleString()} chars
              </span>
            )}
            {comma}
          </span>
        </div>
      );
    }
    if (t === 'number' || t === 'bigint') {
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">
            {indent}{keyLabel}<span className="jt-num">{String(obj)}</span>{comma}
          </span>
        </div>
      );
    }
    if (t === 'boolean') {
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">
            {indent}{keyLabel}<span className="jt-bool">{String(obj)}</span>{comma}
          </span>
        </div>
      );
    }
    if (t === 'null') {
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">
            {indent}{keyLabel}<span className="jt-null">null</span>{comma}
          </span>
        </div>
      );
    }

    const isArr = Array.isArray(obj);
    let keys: string[] | null = null;
    let len = 0;
    try {
      keys = isArr ? null : Object.keys(obj);
      len = isArr ? (obj as any[]).length : (keys as string[]).length;
    } catch {
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">{indent}{keyLabel}<span className="jt-null">[unrenderable]</span>{comma}</span>
        </div>
      );
    }
    const openB = isArr ? '[' : '{';
    const closeB = isArr ? ']' : '}';
    const countLabel = isArr ? `${len} items` : `${len} keys`;

    if (len === 0) {
      return (
        <div className="jt-line" key={`${key}-${lineNum}`}>
          <span className="jt-gutter">{lineNum}</span>
          <span className="jt-content">
            {indent}{keyLabel}
            <span className="jt-bracket">{openB}{closeB}</span>
            {comma}
          </span>
        </div>
      );
    }

    const openLineNum = lineNum;
    const childNodes: React.ReactNode[] = [];
    if (isArr) {
      (obj as any[]).forEach((item, i) => {
        const childExpanded = expanded && level < maxDepth;
        childNodes.push(
          renderNode(item, undefined, level + 1, childExpanded, maxDepth, i === len - 1)
        );
      });
    } else {
      (keys as string[]).forEach((k, i) => {
        const childExpanded = expanded && level < maxDepth;
        childNodes.push(
          renderNode((obj as any)[k], k, level + 1, childExpanded, maxDepth, i === len - 1)
        );
      });
    }
    const closeLineNum = lineCounter.current++;

    return (
      <Fragment key={`${key}-${openLineNum}`}>
        <div className={`jt-line ${expanded ? 'jt-open' : ''}`}>
          <span className="jt-gutter">{openLineNum}</span>
          <span className="jt-content">
            <span
              className="jt-toggle"
              onClick={(e) => {
                e.stopPropagation();
                const line = (e.target as HTMLElement).closest('.jt-line');
                if (line) line.classList.toggle('jt-open');
              }}
            >▶</span>
            {indent}{keyLabel}
            <span className="jt-bracket">{openB}</span>
            <span className="jt-count">{countLabel}</span>
          </span>
        </div>
        <div className="jt-children">
          {childNodes}
          <div className="jt-line">
            <span className="jt-gutter">{closeLineNum}</span>
            <span className="jt-content">
              {indent}<span className="jt-bracket">{closeB}</span>{comma}
            </span>
          </div>
        </div>
      </Fragment>
    );
  }

  return <div className="jt-container">{tree}</div>;
}

function expandInlineString(e: React.MouseEvent, full: string) {
  const target = e.target as HTMLElement;
  const line = target.closest('.jt-line');
  if (!line) return;
  const strSpan = line.querySelector('.jt-str');
  if (!strSpan) return;
  strSpan.textContent = `"${full}"`;
  target.remove();
}

// Modal-based JSON viewer
export function JsonViewerModal({
  title,
  data,
  onClose,
}: {
  title: string;
  data: any;
  onClose: () => void;
}) {
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const jsonStr = useMemo(() => {
    if (typeof data === 'string') return data;
    try { return safeStringify(data, 2); } catch { return String(data); }
  }, [data]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonStr);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" style={{ maxWidth: '92vw', width: 900 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={() => setViewMode(m => m === 'tree' ? 'raw' : 'tree')}>
              切换视图
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleCopy}>复制</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body">
          {viewMode === 'tree' ? (
            <JsonTree data={data} />
          ) : (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre',
                overflow: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.6,
                background: 'var(--bg-surface)',
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                maxHeight: '65vh',
              }}
            >
              {jsonStr}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
