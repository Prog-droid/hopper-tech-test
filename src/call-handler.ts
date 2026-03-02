import { CsvParseError, parseCsvBatch } from './csv-parser';
import { processBatch } from './enrichment-processor';

type BatchResponse = {
  ok: boolean;
  error?: string;
};

export class CallHandler {

  public async handleBatch(payload: string): Promise<BatchResponse> {
    let records;
    try {
      records = parseCsvBatch(payload);
    } catch (err) {
      if (err instanceof CsvParseError) {
        return { ok: false, error: err.message };
      }
      throw err;
    }

    // .catch() prevents unhandled rejection if enrichment fails
    processBatch(records).catch(err => {
      console.error('processBatch failed unexpectedly:', err);
    });

    return { ok: true };
  }
}
