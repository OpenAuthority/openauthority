import { useState } from "react";
import { RulesTable } from "../views/RulesTable";
import { RuleEditor } from "../views/RuleEditor";
import type { Rule } from "../api";
import "./Authorities.css";

export function Authorities() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleEdit(rule: Rule) {
    setEditingRule(rule);
    setEditorOpen(true);
  }

  function handleNew() {
    setEditingRule(null);
    setEditorOpen(true);
  }

  function handleSaved() {
    setEditorOpen(false);
    setEditingRule(null);
    setRefreshKey((k) => k + 1);
  }

  function handleCancel() {
    setEditorOpen(false);
    setEditingRule(null);
  }

  return (
    <div className="authorities-page">
      <div className="authorities-header">
        <h1>Authorities</h1>
        {!editorOpen && (
          <button className="authorities-btn-new" onClick={handleNew}>
            + New Rule
          </button>
        )}
      </div>

      {editorOpen ? (
        <RuleEditor
          ruleId={editingRule?.id}
          initialRule={editingRule ?? undefined}
          onSave={handleSaved}
          onCancel={handleCancel}
        />
      ) : (
        <RulesTable refreshKey={refreshKey} onEdit={handleEdit} />
      )}
    </div>
  );
}
