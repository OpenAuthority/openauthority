/**
 * RuleDeleteModal
 *
 * Confirmation modal for rule deletion. Displays:
 *   - Side panel: natural-language explanation of the rule's effect, action class,
 *     intent group, target pattern, and tags
 *   - Main panel: structured rule preview, recent matching audit entries (last-N),
 *     and a typed-confirmation field that must be completed before deletion proceeds
 *
 * Usage:
 *   <RuleDeleteModal
 *     rule={rule}
 *     auditHits={recentHits}   // optional — newest-first
 *     onConfirm={handleDelete}
 *     onCancel={handleClose}
 *   />
 *
 * The delete button is enabled only when the user has typed the exact
 * confirmation text derived from the rule (e.g. "forbid:filesystem.delete").
 * Pressing Escape or clicking the backdrop dismisses the modal without deleting.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditHit, Rule } from '../types.js';
import {
  buildRuleAriaDescription,
  deriveConfirmationText,
  formatRuleFields,
  formatRuleText,
  formatTimestamp,
  validateConfirmInput,
} from '../utils/ruleHelpers.js';
import './RuleDeleteModal.css';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RuleDeleteModalProps {
  /** The rule the user wants to delete. */
  rule: Rule;
  /**
   * Recent audit entries that matched this rule, newest-first.
   * When provided, they are shown in the "Recent Matching Activity" section
   * so the user can assess the impact of deletion.
   */
  auditHits?: AuditHit[];
  /** Called when the user types the correct confirmation text and clicks Delete. */
  onConfirm: () => void;
  /** Called when the user cancels (button, backdrop click, or Escape key). */
  onCancel: () => void;
}

// ─── Sub-component: impact side panel ────────────────────────────────────────

interface ImpactPanelProps {
  rule: Rule;
  auditHits: AuditHit[];
}

function ImpactPanel({ rule, auditHits }: ImpactPanelProps) {
  const effectVerb = rule.effect === 'forbid' ? 'blocks' : 'allows';
  const hitCount = auditHits.length;

  return (
    <div className="rde-impact">
      <p className="rde-impact-summary">
        This rule{' '}
        <strong className={`rde-effect-badge rde-effect-badge--${rule.effect}`}>
          {effectVerb}
        </strong>{' '}
        requests based on the criteria described.
      </p>

      <dl className="rde-impact-fields">
        {rule.action_class !== undefined && (
          <div className="rde-impact-field">
            <dt>Action class</dt>
            <dd>
              <code>{rule.action_class}</code>
              {' — '}semantic action class; matches operations classified as this type.
            </dd>
          </div>
        )}

        {rule.intent_group !== undefined && (
          <div className="rde-impact-field">
            <dt>Intent group</dt>
            <dd>
              <code>{rule.intent_group}</code>
              {' — '}groups related operations by intent category.
            </dd>
          </div>
        )}

        {rule.action_class === undefined &&
          rule.intent_group === undefined &&
          rule.resource !== undefined && (
            <div className="rde-impact-field">
              <dt>Resource</dt>
              <dd>
                Applies to <code>{rule.resource}</code> resource type
                {rule.match !== undefined ? (
                  <>
                    {' '}matching pattern <code>{rule.match}</code>
                  </>
                ) : null}
                .
              </dd>
            </div>
          )}

        {rule.target_match !== undefined && (
          <div className="rde-impact-field">
            <dt>Target pattern</dt>
            <dd>
              Only applies when the target matches <code>{rule.target_match}</code>.
            </dd>
          </div>
        )}

        {rule.target_in !== undefined && rule.target_in.length > 0 && (
          <div className="rde-impact-field">
            <dt>Target list</dt>
            <dd>Only applies to these specific targets: {rule.target_in.join(', ')}.</dd>
          </div>
        )}

        {rule.tags !== undefined && rule.tags.length > 0 && (
          <div className="rde-impact-field">
            <dt>Tags</dt>
            <dd>
              {rule.tags.map((tag) => (
                <span key={tag} className="rde-tag">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {hitCount > 0 && (
        <p className="rde-impact-warning">
          <span className="rde-impact-warning-icon" aria-hidden="true">
            &#x26A0;
          </span>{' '}
          <strong>{hitCount}</strong> recent {hitCount === 1 ? 'request' : 'requests'} matched
          this rule. Deleting it means {hitCount === 1 ? 'that request' : 'those requests'} would
          no longer be {rule.effect === 'forbid' ? 'blocked' : 'permitted'}.
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RuleDeleteModal({
  rule,
  auditHits = [],
  onConfirm,
  onCancel,
}: RuleDeleteModalProps) {
  const [typedValue, setTypedValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmationText = useMemo(() => deriveConfirmationText(rule), [rule]);
  const fields = useMemo(() => formatRuleFields(rule), [rule]);
  const ruleText = useMemo(() => formatRuleText(fields), [fields]);
  const ariaDescription = useMemo(() => buildRuleAriaDescription(rule, fields), [rule, fields]);

  const { confirmed, errorMessage } = useMemo(
    () => validateConfirmInput(typedValue, confirmationText),
    [typedValue, confirmationText],
  );

  // Focus the confirmation input when the modal mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape dismisses the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    if (confirmed) onConfirm();
  }, [confirmed, onConfirm]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && confirmed) handleConfirm();
    },
    [confirmed, handleConfirm],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  const showError = errorMessage !== null;

  return (
    <div className="rde-overlay" role="presentation" onClick={handleOverlayClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rde-title"
        aria-describedby="rde-subtitle"
        className="rde-modal"
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="rde-header">
          <div>
            <h2 id="rde-title" className="rde-title">
              Delete Rule
            </h2>
            <p id="rde-subtitle" className="rde-subtitle">
              This action is permanent and cannot be undone.
            </p>
          </div>
          <button className="rde-close" onClick={onCancel} aria-label="Close dialog" type="button">
            &#x2715;
          </button>
        </header>

        <div className="rde-body">
          {/* ── Side panel: rule impact ──────────────────────────────────────── */}
          <aside className="rde-side" aria-label="Rule impact explanation">
            <h3 className="rde-panel-title">Rule Impact</h3>
            <ImpactPanel rule={rule} auditHits={auditHits} />
          </aside>

          {/* ── Main panel ───────────────────────────────────────────────────── */}
          <div className="rde-main">
            {/* Rule preview */}
            <section className="rde-section">
              <h3 className="rde-section-title">Rule Preview</h3>
              <pre
                className="rde-rule-text"
                aria-label={ariaDescription}
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
              >
                {ruleText}
              </pre>
            </section>

            {/* Recent audit entries */}
            {auditHits.length > 0 && (
              <section className="rde-section">
                <h3 className="rde-section-title">
                  Recent Matching Activity
                  <span
                    className="rde-count-badge"
                    aria-label={`${auditHits.length} ${auditHits.length === 1 ? 'entry' : 'entries'}`}
                  >
                    {auditHits.length}
                  </span>
                </h3>
                <ul
                  className="rde-audit-list"
                  aria-label="Recent audit entries that matched this rule"
                >
                  {auditHits.map((hit, idx) => (
                    // Index key is acceptable here — list is static within modal lifetime
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={idx} className="rde-audit-entry">
                      <span className="rde-audit-time">{formatTimestamp(hit.timestamp)}</span>
                      <span className="rde-audit-action">{hit.action}</span>
                      <span
                        className={`rde-audit-effect rde-audit-effect--${hit.effect}`}
                        aria-label={`Effect: ${hit.effect}`}
                      >
                        {hit.effect}
                      </span>
                      {hit.agentId !== undefined && (
                        <span className="rde-audit-agent" aria-label={`Agent: ${hit.agentId}`}>
                          {hit.agentId}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Typed confirmation */}
            <section className="rde-section rde-confirm-section">
              <label htmlFor="rde-confirm-input" className="rde-confirm-label">
                <span>Type </span>
                <code className="rde-confirm-code">{confirmationText}</code>
                <span> to confirm deletion</span>
              </label>
              <input
                ref={inputRef}
                id="rde-confirm-input"
                type="text"
                className={`rde-confirm-input${showError ? ' rde-confirm-input--error' : ''}`}
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={confirmationText}
                aria-describedby={showError ? 'rde-confirm-error' : undefined}
                aria-invalid={showError}
                autoComplete="off"
                spellCheck={false}
              />
              {showError && (
                <p id="rde-confirm-error" className="rde-confirm-error" role="alert">
                  Text does not match. Type <code>{confirmationText}</code> exactly.
                </p>
              )}
            </section>

            {/* Action buttons */}
            <div className="rde-actions">
              <button
                className="rde-btn rde-btn--cancel"
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rde-btn rde-btn--delete"
                onClick={handleConfirm}
                disabled={!confirmed}
                aria-disabled={!confirmed}
                type="button"
              >
                Delete Rule
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
