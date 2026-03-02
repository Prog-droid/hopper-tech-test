import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../operator-lookup');

import { lookupOperator, OperatorInfo } from '../operator-lookup';
import { toCallDate, calculateDuration, calculateCost, enrichRecord } from '../enrichment-processor';
import { CallType } from '../call-record.i';

const mockInfo = (rate: number): OperatorInfo => ({
  operator: 'Test Operator',
  country: 'Test Country',
  estimatedCostPerMinute: rate,
});

const SAMPLE_RECORD = {
  id: 'cdr_001',
  callStartTime: '2026-01-21T14:30:00.000Z',
  callEndTime: '2026-01-21T14:35:30.000Z',
  fromNumber: '+14155551234',
  toNumber: '+442071234567',
  callType: CallType.Voice,
  region: 'us-west',
};

describe('toCallDate', () => {
  it('converts a UTC ISO timestamp to yy-MM-dd', () => {
    expect(toCallDate('2026-01-21T14:30:00.000Z')).toBe('26-01-21');
  });

  it('normalises to UTC — a midnight +05:30 timestamp falls on the previous UTC day', () => {
    expect(toCallDate('2026-01-21T00:00:00+05:30')).toBe('26-01-20');
  });
});

describe('calculateDuration', () => {
  it('returns call duration in seconds', () => {
    // 14:30:00 → 14:35:30 = 330s
    expect(calculateDuration(
      '2026-01-21T14:30:00.000Z',
      '2026-01-21T14:35:30.000Z',
    )).toBe(330);
  });
});

describe('calculateCost', () => {
  it('returns undefined when both operator lookups failed', () => {
    expect(calculateCost(300, null, null)).toBeUndefined();
  });

  it('sums both legs when both lookups succeeded', () => {
    // 300s = 5min, from=0.02/min, to=0.05/min → (0.02 + 0.05) * 5 = 0.35
    expect(calculateCost(300, mockInfo(0.02), mockInfo(0.05))).toBe(0.35);
  });

  it('uses only the available rate when one lookup failed', () => {
    // 60s = 1min, from=0.02/min, to=null → 0.02 * 1 = 0.02
    expect(calculateCost(60, mockInfo(0.02), null)).toBe(0.02);
  });
});

describe('enrichRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enriches a record when both lookups succeed', async () => {
    vi.mocked(lookupOperator)
      .mockResolvedValueOnce({ operator: 'AT&T', country: 'United States', estimatedCostPerMinute: 0.02 })
      .mockResolvedValueOnce({ operator: 'BT', country: 'United Kingdom', estimatedCostPerMinute: 0.05 });

    const result = await enrichRecord(SAMPLE_RECORD);

    // 330s = 5.5min, (0.02 + 0.05) * 5.5 = 0.385
    expect(result.duration).toBe(330);
    expect(result.fromOperator).toBe('AT&T');
    expect(result.fromCountry).toBe('United States');
    expect(result.toOperator).toBe('BT');
    expect(result.toCountry).toBe('United Kingdom');
    expect(result.estimatedCost).toBe(0.385);
  });

  it('stores a partial record when one lookup exhausts all retries', async () => {
    vi.useFakeTimers();
    vi.mocked(lookupOperator)
      .mockResolvedValueOnce({ operator: 'AT&T', country: 'United States', estimatedCostPerMinute: 0.02 })
      .mockRejectedValue(new Error('service unavailable'));

    const promise = enrichRecord(SAMPLE_RECORD);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fromOperator).toBe('AT&T');
    expect(result.toOperator).toBeUndefined();
    expect(result.estimatedCost).toBeDefined();
  });
});
