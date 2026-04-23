/**
 * BatchApprovalPanel
 *
 * Operator-facing interface for batching HITL approval decisions to reduce
 * approval fatigue. Displays pending approval requests grouped by a
 * configurable dimension (action_class, agent_id, or policy_name) and
 * supports:
 *   - Per-item approve/deny
 *   - Per-group bulk approve/deny
 *   - Global approve-all / deny-all
 *   - Checkbox selection for custom batches
 *   - Configurable session scoping
 *   - Live countdown timers showing time remaining before auto-expiry
 *   - Audit trail of recent batch decisions
 *
 * Usage:
 *   <BatchApprovalPanel
 *     items={pendingItems}
 *     config={batchingConfig}
 *     auditLog={batchAuditEntries}
 *     onApprove={(tokens) => handleApprove(tokens)}
 *     onDeny={(tokens) => handleDeny(tokens)}
 *   />
 *
 * CSS prefix: `bap-` (Batch Approval Panel)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { BatchAuditEntry, BatchingConfig, PendingApprovalItem } from '../types.js';
import './BatchApprovalPanel.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the grouping key for an item given the configured dimension. */
function getGroupKey(item: PendingApprovalItem, groupBy: BatchingConfig['groupBy']): string {
  switch (groupBy) {
    case 'action_class':
      return item.action_class || '(no action class)';
    case 'agent_id':
      return item.agentId || '(no agent)';
    case 'policy_name':
      return item.policyName || '(no policy)';
  }
}

/** Formats milliseconds remaining as MM:SS. */
function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '0:00';
  const totalSec = Math.floor(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Formats an ISO timestamp for compact audit display. */
function formatAuditTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Countdown timer hook ─────────────────────────────────────────────────────

/** Returns the number of ms remaining until the given Unix-ms deadline. */
function useCountdown(createdAt: number, timeoutMs: number): number {
  const deadline = createdAt + timeoutMs;
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = Math.max(0, deadline - Date.now());
      setRemaining(r);
      if (r === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, remaining]);

  return remaining;
}

// ─── Selection reducer ────────────────────────────────────────────────────────

type SelectionState = Set<string>;
type SelectionAction =
  | { type: 'toggle'; token: string }
  | { type: 'select_all'; tokens: string[] }
  | { type: 'deselect_all' }
  | { type: 'remove'; tokens: string[] };

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  const next = new Set(state);
  switch (action.type) {
    case 'toggle':
      if (next.has(action.token)) {
        next.delete(action.token);
      } else {
        next.add(action.token);
      }
      return next;
    case 'select_all':
      for (const t of action.tokens) next.add(t);
      return next;
    case 'deselect_all':
      return new Set();
    case 'remove':
      for (const t of action.tokens) next.delete(t);
      return next;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CountdownCellProps {
  createdAt: number;
  timeoutMs: number;
}

function CountdownCell({ createdAt, timeoutMs }: CountdownCellProps) {
  const remaining = useCountdown(createdAt, timeoutMs);
  const pct = Math.min(100, (remaining / timeoutMs) * 100);
  const urgent = pct < 20;

  return (
    <span className={`bap-countdown${urgent ? ' bap-countdown--urgent' : ''}`} aria-live="off">
      <span className="bap-countdown-bar-wrap" aria-hidden="true">
        <span className="bap-countdown-bar" style={{ width: `${pct}%` }} />
      </span>
      <span className="bap-countdown-label">{formatCountdown(remaining)}</span>
    </span>
  );
}

interface ItemRowProps {
  item: PendingApprovalItem;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  onDeny: () => void;
}

function ItemRow({
  item,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onApprove,
  onDeny,
}: ItemRowProps) {
  return (
    <>
      <tr className={`bap-item-row${selected ? ' bap-item-row--selected' : ''}`}>
        <td className="bap-cell bap-cell--check">
          <input
            type="checkbox"
            className="bap-checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select approval request for ${item.action_class} on ${item.target || item.toolName}`}
          />
        </td>
        <td className="bap-cell bap-cell--action">
          <button
            className="bap-expand-btn"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            onClick={onToggleExpand}
          >
            <span className={`bap-chevron${expanded ? ' bap-chevron--open' : ''}`} aria-hidden="true">
              ›
            </span>
          </button>
          <code className="bap-action-class">{item.action_class}</code>
        </td>
        <td className="bap-cell bap-cell--target">
          <span className="bap-target">{item.target || '—'}</span>
        </td>
        <td className="bap-cell bap-cell--agent">
          <code className="bap-agent-id">{item.agentId}</code>
        </td>
        <td className="bap-cell bap-cell--timer">
          <CountdownCell createdAt={item.createdAt} timeoutMs={item.timeoutMs} />
        </td>
        <td className="bap-cell bap-cell--actions">
          <button
            className="bap-btn bap-btn--approve-sm"
            type="button"
            onClick={onApprove}
            aria-label={`Approve ${item.action_class}`}
          >
            Approve
          </button>
          <button
            className="bap-btn bap-btn--deny-sm"
            type="button"
            onClick={onDeny}
            aria-label={`Deny ${item.action_class}`}
          >
            Deny
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bap-detail-row" aria-label="Request details">
          <td colSpan={6} className="bap-detail-cell">
            <dl className="bap-detail-list">
              <div className="bap-detail-field">
                <dt>Tool</dt>
                <dd><code>{item.toolName}</code></dd>
              </div>
              <div className="bap-detail-field">
                <dt>Policy</dt>
                <dd><code>{item.policyName}</code></dd>
              </div>
              <div className="bap-detail-field">
                <dt>Channel</dt>
                <dd><code>{item.channelId}</code></dd>
              </div>
              <div className="bap-detail-field">
                <dt>Fallback</dt>
                <dd>
                  <span className={`bap-fallback-badge bap-fallback-badge--${item.fallback === 'deny' ? 'deny' : 'approve'}`}>
                    {item.fallback}
                  </span>
                </dd>
              </div>
              {item.summary !== '' && (
                <div className="bap-detail-field bap-detail-field--wide">
                  <dt>Summary</dt>
                  <dd>{item.summary}</dd>
                </div>
              )}
              {item.session_id !== undefined && (
                <div className="bap-detail-field">
                  <dt>Session</dt>
                  <dd><code>{item.session_id}</code></dd>
                </div>
              )}
              <div className="bap-detail-field">
                <dt>Token</dt>
                <dd><code className="bap-token-preview">{item.token}</code></dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

interface GroupSectionProps {
  groupKey: string;
  items: PendingApprovalItem[];
  selectedTokens: Set<string>;
  expandedTokens: Set<string>;
  autoGroupThreshold: number;
  onToggleSelect: (token: string) => void;
  onToggleExpand: (token: string) => void;
  onApproveGroup: (tokens: string[]) => void;
  onDenyGroup: (tokens: string[]) => void;
  onApproveOne: (token: string) => void;
  onDenyOne: (token: string) => void;
}

function GroupSection({
  groupKey,
  items,
  selectedTokens,
  expandedTokens,
  autoGroupThreshold,
  onToggleSelect,
  onToggleExpand,
  onApproveGroup,
  onDenyGroup,
  onApproveOne,
  onDenyOne,
}: GroupSectionProps) {
  const tokens = items.map((i) => i.token);
  const allSelected = tokens.every((t) => selectedTokens.has(t));
  const someSelected = tokens.some((t) => selectedTokens.has(t));
  const showBulkActions = items.length >= autoGroupThreshold;

  const groupCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (groupCheckRef.current) {
      groupCheckRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function handleGroupCheckChange() {
    if (allSelected) {
      // deselect all in group
      for (const t of tokens) onToggleSelect(t);
    } else {
      // select any unselected
      for (const t of tokens) {
        if (!selectedTokens.has(t)) onToggleSelect(t);
      }
    }
  }

  return (
    <section className="bap-group" aria-label={`Group: ${groupKey}`}>
      <div className="bap-group-header">
        <label className="bap-group-check-label">
          <input
            ref={groupCheckRef}
            type="checkbox"
            className="bap-checkbox"
            checked={allSelected}
            onChange={handleGroupCheckChange}
            aria-label={`Select all in group ${groupKey}`}
          />
        </label>
        <span className="bap-group-key">{groupKey}</span>
        <span className="bap-count-badge" aria-label={`${items.length} pending`}>
          {items.length}
        </span>
        {showBulkActions && (
          <div className="bap-group-bulk-actions">
            <button
              className="bap-btn bap-btn--approve-group"
              type="button"
              onClick={() => onApproveGroup(tokens)}
              aria-label={`Approve all ${items.length} requests in group ${groupKey}`}
            >
              Approve all
            </button>
            <button
              className="bap-btn bap-btn--deny-group"
              type="button"
              onClick={() => onDenyGroup(tokens)}
              aria-label={`Deny all ${items.length} requests in group ${groupKey}`}
            >
              Deny all
            </button>
          </div>
        )}
      </div>

      <table className="bap-table" aria-label={`Pending approvals for ${groupKey}`}>
        <thead className="bap-thead">
          <tr>
            <th className="bap-th bap-th--check" scope="col" aria-label="Select" />
            <th className="bap-th bap-th--action" scope="col">Action class</th>
            <th className="bap-th bap-th--target" scope="col">Target</th>
            <th className="bap-th bap-th--agent" scope="col">Agent</th>
            <th className="bap-th bap-th--timer" scope="col">Expires</th>
            <th className="bap-th bap-th--actions" scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ItemRow
              key={item.token}
              item={item}
              selected={selectedTokens.has(item.token)}
              expanded={expandedTokens.has(item.token)}
              onToggleSelect={() => onToggleSelect(item.token)}
              onToggleExpand={() => onToggleExpand(item.token)}
              onApprove={() => onApproveOne(item.token)}
              onDeny={() => onDenyOne(item.token)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Audit trail ──────────────────────────────────────────────────────────────

interface AuditTrailProps {
  entries: BatchAuditEntry[];
}

function AuditTrail({ entries }: AuditTrailProps) {
  if (entries.length === 0) return null;

  return (
    <section className="bap-audit" aria-label="Batch approval audit trail">
      <h3 className="bap-section-title">
        Batch Audit Trail
        <span className="bap-count-badge" aria-label={`${entries.length} entries`}>
          {entries.length}
        </span>
      </h3>
      <ul className="bap-audit-list" aria-label="Audit log of batch approval decisions">
        {entries.map((entry, idx) => (
          // Index key acceptable — list is append-only within the session
          // eslint-disable-next-line react/no-array-index-key
          <li key={idx} className="bap-audit-entry">
            <span className="bap-audit-time">{formatAuditTimestamp(entry.timestamp)}</span>
            <span
              className={`bap-audit-decision bap-audit-decision--${entry.decision}`}
              aria-label={`Decision: ${entry.decision}`}
            >
              {entry.decision}
            </span>
            <span className="bap-audit-group">{entry.groupKey}</span>
            <span className="bap-audit-count" aria-label={`${entry.count} requests`}>
              ×{entry.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bap-empty" role="status">
      <span className="bap-empty-icon" aria-hidden="true">✓</span>
      <p className="bap-empty-text">No pending approval requests</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface BatchApprovalPanelProps {
  /** All pending approval requests. The panel filters by sessionScope if configured. */
  items: PendingApprovalItem[];
  /** Controls grouping, session filtering, and bulk-action thresholds. */
  config: BatchingConfig;
  /** Audit log of batch decisions made this session. Newest entries should be last. */
  auditLog?: BatchAuditEntry[];
  /** Called when the operator approves one or more tokens. */
  onApprove: (tokens: string[]) => void;
  /** Called when the operator denies one or more tokens. */
  onDeny: (tokens: string[]) => void;
}

export function BatchApprovalPanel({
  items,
  config,
  auditLog = [],
  onApprove,
  onDeny,
}: BatchApprovalPanelProps) {
  const [selectedTokens, dispatchSelection] = useReducer(selectionReducer, new Set<string>());
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());

  // Filter by session scope if configured
  const visibleItems = useMemo(
    () =>
      config.sessionScope !== null
        ? items.filter((i) => i.session_id === config.sessionScope)
        : items,
    [items, config.sessionScope],
  );

  // Group items by configured dimension
  const groups = useMemo(() => {
    const map = new Map<string, PendingApprovalItem[]>();
    for (const item of visibleItems) {
      const key = getGroupKey(item, config.groupBy);
      const group = map.get(key);
      if (group !== undefined) {
        group.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    // Sort groups alphabetically by key
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibleItems, config.groupBy]);

  const allTokens = useMemo(() => visibleItems.map((i) => i.token), [visibleItems]);

  // Prune stale selections when items change
  useEffect(() => {
    const tokenSet = new Set(allTokens);
    const stale = [...selectedTokens].filter((t) => !tokenSet.has(t));
    if (stale.length > 0) {
      dispatchSelection({ type: 'remove', tokens: stale });
    }
  }, [allTokens, selectedTokens]);

  const selectedCount = selectedTokens.size;
  const hasSelection = selectedCount > 0;

  function toggleExpand(token: string) {
    setExpandedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  }

  const handleApproveSelected = useCallback(() => {
    const tokens = [...selectedTokens];
    onApprove(tokens);
    dispatchSelection({ type: 'remove', tokens });
  }, [selectedTokens, onApprove]);

  const handleDenySelected = useCallback(() => {
    const tokens = [...selectedTokens];
    onDeny(tokens);
    dispatchSelection({ type: 'remove', tokens });
  }, [selectedTokens, onDeny]);

  const handleApproveAll = useCallback(() => {
    const limited =
      config.maxBatchSize > 0 ? allTokens.slice(0, config.maxBatchSize) : allTokens;
    onApprove(limited);
    dispatchSelection({ type: 'remove', tokens: limited });
  }, [allTokens, config.maxBatchSize, onApprove]);

  const handleDenyAll = useCallback(() => {
    const limited =
      config.maxBatchSize > 0 ? allTokens.slice(0, config.maxBatchSize) : allTokens;
    onDeny(limited);
    dispatchSelection({ type: 'remove', tokens: limited });
  }, [allTokens, config.maxBatchSize, onDeny]);

  const handleApproveGroup = useCallback(
    (tokens: string[]) => {
      onApprove(tokens);
      dispatchSelection({ type: 'remove', tokens });
    },
    [onApprove],
  );

  const handleDenyGroup = useCallback(
    (tokens: string[]) => {
      onDeny(tokens);
      dispatchSelection({ type: 'remove', tokens });
    },
    [onDeny],
  );

  const handleApproveOne = useCallback(
    (token: string) => {
      onApprove([token]);
      dispatchSelection({ type: 'remove', tokens: [token] });
    },
    [onApprove],
  );

  const handleDenyOne = useCallback(
    (token: string) => {
      onDeny([token]);
      dispatchSelection({ type: 'remove', tokens: [token] });
    },
    [onDeny],
  );

  return (
    <div className="bap-panel" role="region" aria-label="Batch Approval Panel">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bap-header">
        <div className="bap-header-left">
          <h2 className="bap-title">Pending Approvals</h2>
          <p className="bap-subtitle">
            Grouped by{' '}
            <strong>{config.groupBy.replace('_', ' ')}</strong>
            {config.sessionScope !== null && (
              <>
                {' · '}session <code className="bap-session-code">{config.sessionScope}</code>
              </>
            )}
          </p>
        </div>
        {visibleItems.length > 0 && (
          <div className="bap-global-actions">
            {hasSelection && (
              <>
                <span className="bap-selection-info" aria-live="polite">
                  {selectedCount} selected
                </span>
                <button
                  className="bap-btn bap-btn--approve"
                  type="button"
                  onClick={handleApproveSelected}
                  aria-label={`Approve ${selectedCount} selected request${selectedCount === 1 ? '' : 's'}`}
                >
                  Approve selected
                </button>
                <button
                  className="bap-btn bap-btn--deny"
                  type="button"
                  onClick={handleDenySelected}
                  aria-label={`Deny ${selectedCount} selected request${selectedCount === 1 ? '' : 's'}`}
                >
                  Deny selected
                </button>
              </>
            )}
            <button
              className="bap-btn bap-btn--approve-all"
              type="button"
              onClick={handleApproveAll}
              aria-label={`Approve all ${visibleItems.length} pending requests`}
            >
              Approve all
            </button>
            <button
              className="bap-btn bap-btn--deny-all"
              type="button"
              onClick={handleDenyAll}
              aria-label={`Deny all ${visibleItems.length} pending requests`}
            >
              Deny all
            </button>
          </div>
        )}
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="bap-body">
        {visibleItems.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="bap-groups">
            {groups.map(([groupKey, groupItems]) => (
              <GroupSection
                key={groupKey}
                groupKey={groupKey}
                items={groupItems}
                selectedTokens={selectedTokens}
                expandedTokens={expandedTokens}
                autoGroupThreshold={config.autoGroupThreshold}
                onToggleSelect={(token) => dispatchSelection({ type: 'toggle', token })}
                onToggleExpand={toggleExpand}
                onApproveGroup={handleApproveGroup}
                onDenyGroup={handleDenyGroup}
                onApproveOne={handleApproveOne}
                onDenyOne={handleDenyOne}
              />
            ))}
          </div>
        )}

        {/* ── Audit trail ────────────────────────────────────────────────── */}
        <AuditTrail entries={[...auditLog].reverse()} />
      </div>
    </div>
  );
}
