# Hopper Tech Test

## Getting Started

Please refer to [coding-exercise.md](./coding-exercise.md) for the full problem description and instructions.

## Submitting your solution

Create you solution in a fork of this repository. Once you're ready to submit, please add dmanning-resilient as a collaborate on your private repository and send us a message.

## Candidate Notes

### Setup

```bash
npm install
npm test
```

### Approach

The main constraint is the 500ms acknowledgment SLA. With ~10 records and two operator lookups per record at 100–300ms each, enrichment can't happen synchronously within that window — especially with retries. So `handleBatch` does the minimum synchronous work (parse + validate the CSV) and returns immediately. Enrichment and storage run in the background after the response is sent.

A few other decisions worth noting:

- **Parallel lookups per record** — `fromNumber` and `toNumber` lookups run concurrently with `Promise.all`. They're independent calls so there's no reason to sequence them.
- **Partial enrichment over record drops** — if lookups fail after retries, the record is still stored with whatever fields we have. The `EnrichedCallRecord` interface marks those fields optional, so this is the intended design rather than a workaround.
- **`Promise.allSettled` in `processBatch`** — one record failing enrichment shouldn't abort the rest of the batch.
- **Storage** — PostgreSQL for the structured CDR data (ACID matters for billing, and Postgres handles timestamp range queries well for analytics) and Elasticsearch for search and aggregations. Comments in `enrichment-processor.ts` show roughly what the production calls would look like.

### Trade-offs

The main risk with fire-and-forget is **data loss**: once we return `{ ok: true }`, any records that haven't finished enrichment are gone if the process crashes. For a billing system that's a real concern. In production this would be handled by publishing to a durable message queue (SQS, Kafka) before acknowledging — the handler becomes a fast ingestion point and a separate consumer does the enrichment. That also gives you backpressure and a dead-letter queue for failed messages. For this exercise the in-process approach is equivalent in observable behaviour.

The other gap is **observability**: `processBatch` failures currently just `console.error`. In production you'd want a counter feeding into alerting so you know when enrichment is falling behind or failing at scale.

### AI usage

Used Claude to scaffold the implementation. I directed the design through prompting and reviewed the output before committing it — a few things I changed along the way: the ISO timestamp validator accepted bare date strings which would have silently broken the date conversion, the CSV parser used `as unknown as CallRecord` rather than a proper typed construction, and the comments were over-explained. Happy to walk through any part of the code.