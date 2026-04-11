import { describe, it } from 'vitest';
import { createRulesApi } from './rules-api.js';
import type { RulesApiOptions, RulesApiRouter, RuleRecord } from './rules-api.js';

describe('createRulesApi', () => {
  describe('handleList', () => {
    it.todo('returns 200 with an array of all persisted rules');
    it.todo('returns 200 with an empty array when the data file does not exist');
    it.todo('returns 200 with an empty array when the file contains an empty array');
  });

  describe('handleCreate', () => {
    it.todo('assigns a unique id to the new rule');
    it.todo('persists the new rule to the data file');
    it.todo('returns 201 with the created RuleRecord');
    it.todo('returns 400 when effect is missing');
    it.todo('returns 400 when resource is missing');
    it.todo('returns 400 when match is missing');
    it.todo('preserves optional fields (reason, tags, rateLimit) when provided');
  });

  describe('handleUpdate', () => {
    it.todo('updates the rule with the given id');
    it.todo('persists the change to the data file');
    it.todo('returns 200 with the updated RuleRecord');
    it.todo('returns 404 when no rule with the given id exists');
    it.todo('does not modify other rules in the file');
  });

  describe('handleDelete', () => {
    it.todo('removes the rule with the given id from the data file');
    it.todo('returns 204 on success');
    it.todo('returns 404 when no rule with the given id exists');
    it.todo('does not modify other rules in the file');
  });
});

void createRulesApi;
void ({} as RulesApiOptions);
void ({} as RulesApiRouter);
void ({} as RuleRecord);
