export function isValidUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 4 || /\s/.test(trimmed)) return false;

  try {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const candidate = hasProtocol ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Must have a valid hostname with at least one dot or be localhost
    const hostname = parsed.hostname;
    if (!hostname) return false;
    if (hostname === 'localhost') return true;

    // Check for valid domain name format (e.g., example.com, devpost.com)
    return hostname.includes('.') && hostname.split('.').every((part) => part.length > 0);
  } catch {
    return false;
  }
}

export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || !isValidUrl(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function isValidDateFormat(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr.trim())) return false;
  const d = new Date(dateStr.trim());
  return !isNaN(d.getTime());
}

export function isValidTimeFormat(timeStr: string | null | undefined): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(timeStr.trim());
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateEventForSave(event: {
  title?: string;
  event_start_date?: string | null;
  registration_deadline?: string | null;
  registration_link?: string | null;
  confidence_score?: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!event.title || event.title.trim().length === 0) {
    issues.push({ field: 'title', message: 'Event title is required.', severity: 'error' });
  }

  if (!event.event_start_date && !event.registration_deadline) {
    issues.push({
      field: 'dates',
      message: 'Both Event Date and Registration Deadline are missing. Please specify at least one.',
      severity: 'error',
    });
  }

  if (event.event_start_date && !isValidDateFormat(event.event_start_date)) {
    issues.push({
      field: 'event_start_date',
      message: 'Event start date must be in YYYY-MM-DD format.',
      severity: 'error',
    });
  }

  if (event.registration_deadline && !isValidDateFormat(event.registration_deadline)) {
    issues.push({
      field: 'registration_deadline',
      message: 'Registration deadline must be in YYYY-MM-DD format.',
      severity: 'error',
    });
  }

  if (event.registration_link && !isValidUrl(event.registration_link)) {
    issues.push({
      field: 'registration_link',
      message: 'Registration link appears to be an invalid URL.',
      severity: 'warning',
    });
  }

  if (typeof event.confidence_score === 'number' && event.confidence_score < 0.7) {
    issues.push({
      field: 'confidence_score',
      message: `Low AI confidence score (${Math.round(event.confidence_score * 100)}%). Please review carefully.`,
      severity: 'warning',
    });
  }

  return issues;
}
