import { ExtractedEvent, ExtractionQuotaInfo } from './event';

export type ExtractionTier = 'tier1_text' | 'tier2_vision';

export interface ExtractRequest {
  text?: string;
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  referenceDate?: string;
}

export interface ExtractResponse {
  events: ExtractedEvent[];
  tier_used?: ExtractionTier;
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
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}
