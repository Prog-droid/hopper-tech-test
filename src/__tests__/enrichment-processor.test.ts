import { describe, it, expect } from 'vitest';
import { toCallDate, calculateDuration, calculateCost } from '../enrichment-processor';
import { OperatorInfo } from '../operator-lookup';

const mockInfo = (rate: number): OperatorInfo => ({
  operator: 'Test Operator',
  country: 'Test Country',
  estimatedCostPerMinute: rate,
});

describe('toCallDate', () => {
  it('converts a UTC ISO timestamp to yy-MM-dd', () => {
    expect(toCallDate('2026-01-21T14:30:00.000Z')).toBe('26-01-21');
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
