import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the enrichment processor so tests are fast and deterministic.
// We're testing the handler's contract (parse, validate, acknowledge),
// not the enrichment pipeline itself.
vi.mock('../enrichment-processor', () => ({
  processBatch: vi.fn().mockResolvedValue(undefined),
}));

import { CallHandler } from '../call-handler';
import { processBatch } from '../enrichment-processor';

const VALID_CSV = [
  'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
  'cdr_001,2026-01-21T14:30:00.000Z,2026-01-21T14:35:30.000Z,+14155551234,+442071234567,voice,us-west',
  'cdr_002,2026-01-21T14:31:15.000Z,2026-01-21T14:33:45.000Z,+442071234567,+14155551234,voice,eu-west',
].join('\n');

describe('CallHandler.handleBatch', () => {
  let handler: CallHandler;

  beforeEach(() => {
    handler = new CallHandler();
    vi.clearAllMocks();
  });

  it('acknowledges a valid batch quickly and triggers background processing', async () => {
    const start = Date.now();
    const response = await handler.handleBatch(VALID_CSV);
    const elapsed = Date.now() - start;

    // Returns ok immediately
    expect(response).toEqual({ ok: true });

    // Well within 500ms SLA — only CSV parsing happens before we return
    expect(elapsed).toBeLessThan(100);

    // Background enrichment was triggered with the parsed records
    expect(processBatch).toHaveBeenCalledOnce();
    expect(processBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cdr_001', callType: 'voice', region: 'us-west' }),
        expect.objectContaining({ id: 'cdr_002', callType: 'voice', region: 'eu-west' }),
      ])
    );
  });

  it('returns ok: false for an empty payload without triggering processing', async () => {
    const response = await handler.handleBatch('');

    expect(response).toEqual({ ok: false, error: 'Empty payload' });
    expect(processBatch).not.toHaveBeenCalled();
  });

  it('returns ok: false for CSV missing required columns without triggering processing', async () => {
    const badCsv = [
      'id,callStartTime',
      'cdr_001,2026-01-21T14:30:00.000Z',
    ].join('\n');

    const response = await handler.handleBatch(badCsv);

    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/Missing required columns/);
    expect(processBatch).not.toHaveBeenCalled();
  });
});
