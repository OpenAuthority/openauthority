/**
 * Demo application for RuleDeleteModal.
 *
 * Shows a simple rule list where each rule has a Delete button that opens
 * the RuleDeleteModal with sample audit hits. Demonstrates all field types:
 * action-class rule, intent-group rule, resource rule, and a rule with
 * target_match and target_in.
 */

import { useState } from 'react';
import { RuleDeleteModal } from './components/RuleDeleteModal.js';
import type { AuditHit, Rule } from './types.js';

// ─── Demo data ────────────────────────────────────────────────────────────────

interface DemoRule {
  id: string;
  rule: Rule;
  auditHits: AuditHit[];
}

const DEMO_RULES: DemoRule[] = [
  {
    id: 'rule-1',
    rule: {
      effect: 'forbid',
      action_class: 'filesystem.delete',
      reason: 'Block all file deletion operations',
      tags: ['filesystem', 'security'],
      priority: 90,
    },
    auditHits: [
      { timestamp: '2024-03-15T14:23:01Z', action: 'rm_rf', effect: 'forbid', agentId: 'agent-1' },
      { timestamp: '2024-03-15T09:10:00Z', action: 'delete', effect: 'forbid' },
      {
        timestamp: '2024-03-14T22:05:33Z',
        action: 'filesystem.delete',
        effect: 'forbid',
        agentId: 'agent-2',
      },
    ],
  },
  {
    id: 'rule-2',
    rule: {
      effect: 'forbid',
      intent_group: 'data_exfiltration',
      reason: 'Prevent data exfiltration attempts',
      tags: ['data', 'exfiltration', 'high-risk'],
    },
    auditHits: [
      {
        timestamp: '2024-03-13T11:00:00Z',
        action: 'send_email',
        effect: 'forbid',
        agentId: 'agent-3',
      },
    ],
  },
  {
    id: 'rule-3',
    rule: {
      effect: 'permit',
      resource: 'file',
      match: '/tmp/*',
      target_match: '*.log',
    },
    auditHits: [],
  },
  {
    id: 'rule-4',
    rule: {
      effect: 'forbid',
      resource: 'external',
      target_in: ['evil.example.com', 'badactor.io'],
      reason: 'Block known malicious domains',
      tags: ['network', 'blocklist'],
    },
    auditHits: [
      {
        timestamp: '2024-03-15T08:45:12Z',
        action: 'http_request',
        effect: 'forbid',
        agentId: 'agent-1',
      },
    ],
  },
];

// ─── Rule row component ───────────────────────────────────────────────────────

interface RuleRowProps {
  demoRule: DemoRule;
  onDeleteClick: (id: string) => void;
}

function RuleRow({ demoRule, onDeleteClick }: RuleRowProps) {
  const { rule, auditHits } = demoRule;

  const primaryField = (() => {
    if (rule.action_class !== undefined) return `action_class: ${rule.action_class}`;
    if (rule.intent_group !== undefined) return `intent_group: ${rule.intent_group}`;
    if (rule.resource !== undefined) {
      const suffix = rule.match !== undefined ? ` / ${rule.match}` : '';
      return `resource: ${rule.resource}${suffix}`;
    }
    return 'unconditional';
  })();

  return (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '0.75rem 1rem' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '0.15em 0.5em',
            borderRadius: '3px',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            background: rule.effect === 'forbid' ? '#fee2e2' : '#d1fae5',
            color: rule.effect === 'forbid' ? '#b91c1c' : '#065f46',
          }}
        >
          {rule.effect}
        </span>
      </td>
      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
        {primaryField}
      </td>
      <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.8125rem' }}>
        {rule.reason ?? '—'}
      </td>
      <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.8125rem' }}>
        {auditHits.length > 0 ? `${auditHits.length} recent` : 'No recent hits'}
      </td>
      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
        <button
          onClick={() => onDeleteClick(demoRule.id)}
          style={{
            padding: '0.35rem 0.75rem',
            background: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #fca5a5',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
          type="button"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules] = useState<DemoRule[]>(DEMO_RULES);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingRule = rules.find((r) => r.id === pendingDeleteId) ?? null;

  function handleDeleteClick(id: string) {
    setPendingDeleteId(id);
  }

  function handleConfirm() {
    if (pendingDeleteId !== null) {
      setRules((prev) => prev.filter((r) => r.id !== pendingDeleteId));
      setPendingDeleteId(null);
    }
  }

  function handleCancel() {
    setPendingDeleteId(null);
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>
        Clawthority — Policy Rules
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Click Delete on any rule to see the deletion confirmation modal.
      </p>

      {rules.length === 0 ? (
        <p style={{ color: '#6b7280', fontStyle: 'italic' }}>All rules have been deleted.</p>
      ) : (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Effect', 'Criteria', 'Reason', 'Activity', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '0.625rem 1rem',
                      textAlign: h === '' ? 'right' : 'left',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#6b7280',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((dr) => (
                <RuleRow key={dr.id} demoRule={dr} onDeleteClick={handleDeleteClick} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingRule !== null && (
        <RuleDeleteModal
          rule={pendingRule.rule}
          auditHits={pendingRule.auditHits}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
