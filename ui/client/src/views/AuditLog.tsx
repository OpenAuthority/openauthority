import { useState, useEffect, useRef, useCallback } from "react";
import "./AuditLog.css";

// ─── Types (mirrors server AuditEntry + client-generated _clientId) ───────────

export interface AuditLogEntry {
  /** Client-generated unique key (not sent by server). */
  _clientId: string;
  timestamp: string;
  policyId: string;
  policyName: string;
  agentId?: string;
  resourceType?: string;
  action?: string;
  effect: string;
  matchedRuleId?: string;
  reason?: string;
}

interface Filters {
  agent: string;
  action: string;
  effect: "" | "permit" | "forbid";
}

const MAX_ENTRIES = 500;

let _clientSeq = 0;
function nextClientId(): string {
  return `sse-${Date.now()}-${++_clientSeq}`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

function formatTimestampFull(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [filters, setFilters] = useState<Filters>({ agent: "", action: "", effect: "" });
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;

  useEffect(() => {
    const es = new EventSource("/api/audit/stream");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data as string) as Omit<AuditLogEntry, "_clientId">;
        const entry: AuditLogEntry = { ...raw, _clientId: nextClientId() };
        setEntries((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
        });
      } catch {
        // ignore malformed entries
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (!isAtBottom && autoScrollRef.current) {
      setAutoScroll(false);
    }
  }, []);

  const filteredEntries = entries.filter((entry) => {
    if (
      filters.agent &&
      !(entry.agentId ?? "").toLowerCase().includes(filters.agent.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.action &&
      !(entry.action ?? "").toLowerCase().includes(filters.action.toLowerCase())
    ) {
      return false;
    }
    if (filters.effect && entry.effect !== filters.effect) {
      return false;
    }
    return true;
  });

  const copyEntry = (entry: AuditLogEntry) => {
    const { _clientId: _, ...serverEntry } = entry;
    const text = JSON.stringify(serverEntry, null, 2);
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedId(entry._clientId);
        setTimeout(() => setCopiedId(null), 2000);
      },
      () => {/* clipboard denied */}
    );
  };

  const resumeScroll = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="audit-log">
      <div className="audit-log-header">
        <div className="audit-log-title">
          <h1>Audit Log</h1>
          <span className={`audit-status-badge ${connected ? "audit-status-badge--live" : "audit-status-badge--offline"}`}>
            <span className="audit-status-dot" />
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
        <div className="audit-log-controls">
          <div className="audit-filters">
            <input
              type="text"
              placeholder="Filter by agent…"
              value={filters.agent}
              onChange={(e) => setFilters((f) => ({ ...f, agent: e.target.value }))}
              className="audit-filter-input"
            />
            <input
              type="text"
              placeholder="Filter by action…"
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="audit-filter-input"
            />
            <select
              value={filters.effect}
              onChange={(e) =>
                setFilters((f) => ({ ...f, effect: e.target.value as Filters["effect"] }))
              }
              className="audit-filter-select"
            >
              <option value="">All effects</option>
              <option value="permit">Permit</option>
              <option value="forbid">Forbid</option>
            </select>
          </div>
          <button
            className={`audit-scroll-btn ${autoScroll ? "audit-scroll-btn--active" : ""}`}
            onClick={() => (autoScroll ? setAutoScroll(false) : resumeScroll())}
          >
            {autoScroll ? "Pause scroll" : "Resume scroll"}
          </button>
        </div>
      </div>

      <div className="audit-log-list" ref={listRef} onScroll={handleScroll}>
        {filteredEntries.length === 0 ? (
          <div className="audit-empty">
            {connected
              ? entries.length > 0
                ? "No entries match the current filters."
                : "Waiting for audit events…"
              : "Connecting to audit log stream…"}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry._clientId}
              className={`audit-entry audit-entry--${entry.effect}`}
            >
              <span className="audit-entry-time" title={formatTimestampFull(entry.timestamp)}>
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className={`audit-entry-effect audit-effect--${entry.effect}`}>
                {entry.effect.toUpperCase()}
              </span>
              <span className="audit-entry-agent">{entry.agentId ?? "—"}</span>
              <span className="audit-entry-resource">
                {entry.resourceType && (
                  <span className="audit-entry-resource-type">{entry.resourceType}</span>
                )}
                {entry.action && (
                  <span className="audit-entry-resource-name">{entry.action}</span>
                )}
              </span>
              {entry.reason && (
                <span className="audit-entry-reason">{entry.reason}</span>
              )}
              <button
                className={`audit-entry-copy ${copiedId === entry._clientId ? "audit-entry-copy--copied" : ""}`}
                onClick={() => copyEntry(entry)}
                title="Copy entry as JSON"
              >
                {copiedId === entry._clientId ? "Copied!" : "Copy"}
              </button>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="audit-log-footer">
        {!autoScroll && (
          <button className="audit-scroll-resume-banner" onClick={resumeScroll}>
            ↓ New entries below — click to resume auto-scroll
          </button>
        )}
        <span className="audit-count">
          {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
          {entries.length !== filteredEntries.length && ` (${entries.length} total)`}
        </span>
      </div>
    </div>
  );
}
