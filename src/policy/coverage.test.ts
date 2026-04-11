import { describe, it } from 'vitest';
import { CoverageMap } from './coverage.js';
import type { CoverageCell, CoverageEntry, CoverageState } from './coverage.js';

describe('CoverageMap', () => {
  describe('record', () => {
    it.todo('records a permit hit for a resource/name pair');
    it.todo('records a forbid hit for a resource/name pair');
    it.todo('records a rate-limited hit for a resource/name pair');
    it.todo('increments hitCount on repeated calls for the same pair');
    it.todo('sets lastHitAt as a valid ISO 8601 timestamp');
    it.todo('stores rateLimit from the matched rule on the cell');
    it.todo('retains existing rateLimit when no matchedRule is provided');
    it.todo('overwrites state on each call (last write wins)');
  });

  describe('get', () => {
    it.todo('returns undefined for a resource/name pair that has never been recorded');
    it.todo('returns the current CoverageCell after a record call');
  });

  describe('entries', () => {
    it.todo('returns an empty array for a fresh CoverageMap');
    it.todo('returns one entry per unique resource/name pair');
    it.todo('round-trips resource and name correctly through the internal key');
    it.todo('handles resource names that contain colons without corruption');
  });

  describe('reset', () => {
    it.todo('clears all recorded cells');
    it.todo('entries() returns an empty array after reset');
    it.todo('get() returns undefined for previously recorded pairs after reset');
  });
});

void ({} as CoverageMap);
void ({} as CoverageCell);
void ({} as CoverageEntry);
void ({} as CoverageState);
