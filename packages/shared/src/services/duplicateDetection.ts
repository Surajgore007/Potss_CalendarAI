import { CalendarEvent, ExtractedEvent } from '../types/event';

/** Calculate string similarity (0.0 to 1.0) using normalized Levenshtein & token overlap */
export function calculateTitleSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  // Exact substring match
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return 0.8 + 0.2 * (minLen / maxLen);
  }

  // Token Jaccard similarity
  const tokens1 = new Set(s1.split(/\s+/));
  const tokens2 = new Set(s2.split(/\s+/));
  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Levenshtein distance
  const levDist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const levSimilarity = 1 - levDist / maxLen;

  return Math.max(jaccard * 0.7 + levSimilarity * 0.3, levSimilarity);
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/** Check if an extracted event is a likely duplicate of an existing event in the calendar */
export function detectDuplicate(
  extracted: Pick<ExtractedEvent, 'title' | 'event_start_date' | 'registration_deadline'>,
  existingEvents: CalendarEvent[]
): {
  isDuplicate: boolean;
  matchedEvent?: CalendarEvent;
  similarityScore: number;
} {
  let highestScore = 0;
  let bestMatch: CalendarEvent | undefined = undefined;

  for (const existing of existingEvents) {
    const titleSim = calculateTitleSimilarity(extracted.title, existing.title);
    
    // Check date matches
    const startDateMatch =
      extracted.event_start_date &&
      existing.event_start_date &&
      extracted.event_start_date === existing.event_start_date;
      
    const deadlineMatch =
      extracted.registration_deadline &&
      existing.registration_deadline &&
      extracted.registration_deadline === existing.registration_deadline;

    let combinedScore = titleSim;

    if (startDateMatch && titleSim > 0.45) {
      combinedScore = Math.max(combinedScore, 0.75 + titleSim * 0.25);
    } else if (deadlineMatch && titleSim > 0.5) {
      combinedScore = Math.max(combinedScore, 0.7 + titleSim * 0.25);
    }

    if (combinedScore > highestScore) {
      highestScore = combinedScore;
      bestMatch = existing;
    }
  }

  const isDuplicate = highestScore >= 0.7;

  return {
    isDuplicate,
    matchedEvent: isDuplicate ? bestMatch : undefined,
    similarityScore: highestScore,
  };
}
