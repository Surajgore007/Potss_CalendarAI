import { ExtractedEvent, ExtractionQuotaInfo } from './event';

export interface ExtractRequest {
  text: string;
  referenceDate?: string;
}

export interface ExtractResponse {
  events: ExtractedEvent[];
  raw_input?: string;
  extracted_at?: string;
  quota?: ExtractionQuotaInfo;
}

export interface ExtractErrorResponse {
  error: string;
  code?: string;
  quota?: ExtractionQuotaInfo;
}

export interface ExtractEventsOptions {
  getIdToken?: (forceRefresh?: boolean) => Promise<string | null>;
  workerUrl?: string;
  referenceDate?: Date;
}
