import { CallRecord, CallType } from './call-record.i';

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

const EXPECTED_HEADERS = [
  'id', 'callStartTime', 'callEndTime',
  'fromNumber', 'toNumber', 'callType', 'region',
] as const satisfies ReadonlyArray<keyof CallRecord>;


export function parseCsvBatch(csv: string): CallRecord[] {
  const trimmed = csv.trim();
  if (!trimmed) {
    throw new CsvParseError('Empty payload');
  }

  const lines = trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new CsvParseError('CSV must contain a header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  validateHeaders(headers);

  return lines.slice(1).map((line, index) => parseRow(line, index + 2, headers));
}

function validateHeaders(headers: string[]): void {
  const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    throw new CsvParseError(`Missing required columns: ${missing.join(', ')}`);
  }
}

function parseRow(line: string, rowNumber: number, headers: string[]): CallRecord {
  const values = line.split(',').map(v => v.trim());

  if (values.length !== headers.length) {
    throw new CsvParseError(
      `Row ${rowNumber}: expected ${headers.length} columns, got ${values.length}`
    );
  }

  const record: Record<string, string> = {};
  headers.forEach((h, i) => { record[h] = values[i]; });

  if (!record.id) {
    throw new CsvParseError(`Row ${rowNumber}: missing id`);
  }
  if (!record.fromNumber) {
    throw new CsvParseError(`Row ${rowNumber}: missing fromNumber`);
  }
  if (!record.toNumber) {
    throw new CsvParseError(`Row ${rowNumber}: missing toNumber`);
  }
  if (!isIso8601(record.callStartTime)) {
    throw new CsvParseError(`Row ${rowNumber}: invalid callStartTime`);
  }
  if (!isIso8601(record.callEndTime)) {
    throw new CsvParseError(`Row ${rowNumber}: invalid callEndTime`);
  }
  if (new Date(record.callEndTime) <= new Date(record.callStartTime)) {
    throw new CsvParseError(`Row ${rowNumber}: callEndTime must be after callStartTime`);
  }
  if (!(Object.values(CallType) as string[]).includes(record.callType)) {
    throw new CsvParseError(`Row ${rowNumber}: callType must be 'voice' or 'video', got '${record.callType}'`);
  }

  return {
    id: record.id,
    callStartTime: record.callStartTime,
    callEndTime: record.callEndTime,
    fromNumber: record.fromNumber,
    toNumber: record.toNumber,
    callType: record.callType as CallType,
    region: record.region,
  };
}

function isIso8601(value: string): boolean {
  // Require a 'T' separator — bare dates like "2026-01-21" pass new Date() but
  // would silently produce midnight UTC rather than a real call timestamp.
  if (!value || !value.includes('T')) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}
