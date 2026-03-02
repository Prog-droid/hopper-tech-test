export enum CallType {
  Voice = 'voice',
  Video = 'video',
}

export interface CallRecord {
  id: string;
  callStartTime: string; // ISO 8601 format
  callEndTime: string;   // ISO 8601 format
  fromNumber: string;
  toNumber: string;
  callType: CallType;
  region: string;
}

export interface EnrichedCallRecord extends CallRecord {
  duration: number; // calculated in seconds
  fromOperator?: string;
  toOperator?: string;
  fromCountry?: string;
  toCountry?: string;
  estimatedCost?: number;
}
