import { CallRecord, EnrichedCallRecord } from './call-record.i';
import { lookupOperator, OperatorInfo } from './operator-lookup';

export function toCallDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toISOString().slice(2, 10);
}

export function calculateDuration(startIso: string, endIso: string): number {
  return Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000
  );
}

export function calculateCost(
  durationSeconds: number,
  fromInfo: OperatorInfo | null,
  toInfo: OperatorInfo | null
): number | undefined {
  if (!fromInfo && !toInfo) return undefined;
  const fromRate = fromInfo?.estimatedCostPerMinute ?? 0;
  const toRate = toInfo?.estimatedCostPerMinute ?? 0;
  return parseFloat(((fromRate + toRate) * (durationSeconds / 60)).toFixed(4));
}

const MAX_RETRIES = 2;

async function lookupWithRetry(
  phoneNumber: string,
  callDate: string
): Promise<OperatorInfo | null> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await lookupOperator(phoneNumber, callDate);
    } catch (err) {
      lastError = err as Error;
    }
  }
  console.warn(`lookupOperator failed for ${phoneNumber} after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
  return null;
}

export async function enrichRecord(record: CallRecord): Promise<EnrichedCallRecord> {
  const callDate = toCallDate(record.callStartTime);
  const duration = calculateDuration(record.callStartTime, record.callEndTime);

  const [fromInfo, toInfo] = await Promise.all([
    lookupWithRetry(record.fromNumber, callDate),
    lookupWithRetry(record.toNumber, callDate),
  ]);

  return {
    ...record,
    duration,
    fromOperator: fromInfo?.operator,
    toOperator: toInfo?.operator,
    fromCountry: fromInfo?.country,
    toCountry: toInfo?.country,
    estimatedCost: calculateCost(duration, fromInfo, toInfo),
  };
}

export async function processBatch(records: CallRecord[]): Promise<void> {
  const results = await Promise.allSettled(records.map(r => enrichRecord(r)));

  const enriched: EnrichedCallRecord[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      enriched.push(result.value);
    } else {
      console.error('Failed to enrich record:', result.reason);
    }
  }

  if (enriched.length === 0) return;

  await Promise.all([
    dbSave(enriched),
    searchIndexUpsert(enriched),
  ]);
}

// Stub — production would use PostgreSQL (node-postgres or Prisma).
// CDRs are relational and structured, ACID matters for billing data, and
// Postgres handles timestamp range queries well for analytics.
async function dbSave(records: EnrichedCallRecord[]): Promise<void> {
  // INSERT INTO call_records (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET ...
  console.log(`[DB] Saving ${records.length} enriched records`);
}

// Stub — production would use Elasticsearch.
// Good fit for full-text search over operators/regions and fast aggregations
// (cost by region, volume by operator) without extra infrastructure.
async function searchIndexUpsert(records: EnrichedCallRecord[]): Promise<void> {
  // esClient.bulk({ body: records.flatMap(r => [{ index: { _index: 'cdrs', _id: r.id } }, r]) })
  console.log(`[Search] Indexing ${records.length} enriched records`);
}
