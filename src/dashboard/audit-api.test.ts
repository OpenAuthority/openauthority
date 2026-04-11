import { describe, it } from 'vitest';
import { createAuditApi } from './audit-api.js';
import type { AuditApiOptions, AuditApiRouter, AuditApiEntry } from './audit-api.js';

describe('createAuditApi', () => {
  describe('handleList', () => {
    it.todo('returns 200 with entries from the JSONL file combined with the ring buffer');
    it.todo('returns 200 with an empty array when the JSONL file does not exist');
    it.todo('deduplicates entries that appear in both the file and the ring buffer');
    it.todo('respects a ?limit query param to cap the number of returned entries');
    it.todo('streams the JSONL file line by line to avoid loading it fully into memory');
  });

  describe('handleAppend', () => {
    it.todo('adds the entry to the ring buffer');
    it.todo('broadcasts the entry to all connected SSE clients');
    it.todo('returns 201 on success');
    it.todo('returns 400 when the request body is missing required fields');
  });

  describe('handleStream', () => {
    it.todo('sets Content-Type to text/event-stream');
    it.todo('sets Cache-Control: no-cache and Connection: keep-alive headers');
    it.todo('adds the response to the connected SSE clients set on connect');
    it.todo('removes the response from the SSE clients set on connection close');
    it.todo('sends previously buffered entries as initial events on connect');
  });

  describe('push', () => {
    it.todo('adds the entry to the ring buffer');
    it.todo('broadcasts the entry to all connected SSE clients');
    it.todo('evicts the oldest entry when the ring buffer exceeds ringBufferSize');
    it.todo('does not throw when no SSE clients are connected');
  });
});

void createAuditApi;
void ({} as AuditApiOptions);
void ({} as AuditApiRouter);
void ({} as AuditApiEntry);
