import { ExtractedEvent, ExtractionResponse, EventType, EventMode } from '../types/event';
import { GEMINI_RESPONSE_SCHEMA } from '../constants';
import { getTodayISODate, getTomorrowISODate, getNextMondayISODate } from '../utils/dateUtils';
import { sanitizeUrl, isValidDateFormat } from '../utils/validation';

export interface ExtractionOptions {
  apiKey?: string;
  referenceDate?: Date;
  model?: string;
}

export function buildSystemPrompt(referenceDate: Date = new Date()): string {
  const todayStr = getTodayISODate(referenceDate);
  const tomorrowStr = getTomorrowISODate(referenceDate);
  const nextMondayStr = getNextMondayISODate(referenceDate);
  const dayOfWeek = referenceDate.toLocaleDateString('en-US', { weekday: 'long' });

  return `You are an expert event information extraction system. Your job is to parse informal, conversational, or forwarded WhatsApp messages and extract tech events, hackathons, CTFs, workshops, tech meetups, and registration deadlines.

CURRENT TEMPORAL CONTEXT:
- TODAY'S DATE: ${todayStr} (${dayOfWeek})
- TOMORROW'S DATE: ${tomorrowStr}
- NEXT WEEK STARTS (Monday): ${nextMondayStr}

CRITICAL RULES FOR EXTRACTION:
1. RELATIVE DATE RESOLUTION: Use the temporal context above to resolve relative dates. "This Saturday" means the upcoming Saturday relative to ${todayStr}. "Tomorrow" means ${tomorrowStr}. "Next Friday" means the Friday of next week.
2. REGISTRATION DEADLINE vs EVENT DATE: ALWAYS distinguish REGISTRATION DEADLINE from EVENT START DATE as separate fields. For example, "Register by ${todayStr}, event on ${tomorrowStr}" -> registration_deadline="${todayStr}", event_start_date="${tomorrowStr}".
3. MULTI-EVENT SUPPORT: One pasted message can contain MULTIPLE events (e.g. weekly digests, tech event roundups). Always return all events in the "events" array.
4. MISSING DATES: If an event date or deadline cannot be determined with certainty, return null for that field. NEVER guess or fabricate dates.
5. VALIDATE URLS: For registration_link, extract clean URLs.
6. SOURCE GROUP: If the message indicates a source group/community (e.g. "Forwarded from Bangalore Devs", "GDG Delhi"), extract it into source_group.
7. CONFIDENCE SCORE: Return a number between 0.0 and 1.0 based on:
   - 0.9 - 1.0: Precise dates, clear title, confirmed link/location.
   - 0.7 - 0.89: Good details, but minor ambiguity (e.g. missing exact time or location).
   - < 0.7: Ambiguous or relative dates without clear year/month, missing critical information.
8. TYPE CLASSIFICATION:
   - "hackathon": coding competitions, project building, prize pools
   - "ctf": cybersecurity capture-the-flag competitions
   - "meetup": tech gatherings, talks, networking
   - "workshop": hands-on learning, bootcamps, masterclasses
   - "deadline": standalone submission/registration deadlines
   - "other": conferences, general tech events`;
}

/**
 * Extract structured events from raw WhatsApp message using Groq (Fast LPU Inference)
 */
export async function extractEventsWithGemini(
  rawText: string,
  options?: ExtractionOptions
): Promise<ExtractionResponse> {
  const apiKey =
    options?.apiKey ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GROQ_API_KEY) ||
    '';

  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error(
      'Groq API key is not configured. Please set EXPO_PUBLIC_GROQ_API_KEY in your .env file.'
    );
  }

  const trimmedText = rawText.trim();
  if (!trimmedText) {
    return {
      events: [],
      raw_input: rawText,
      extracted_at: new Date().toISOString(),
    };
  }

  const referenceDate = options?.referenceDate || new Date();
  const systemPrompt =
    buildSystemPrompt(referenceDate) +
    `\n\nOUTPUT FORMAT:\nYou MUST return ONLY a JSON object containing an "events" array that strictly conforms to this schema:\n${JSON.stringify(
      GEMINI_RESPONSE_SCHEMA,
      null,
      2
    )}`;

  const model = options?.model || 'openai/gpt-oss-120b';
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract all tech events, hackathons, CTFs, workshops, or deadlines from this WhatsApp message:\n\n"""\n${trimmedText}\n"""`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawJson = data?.choices?.[0]?.message?.content;

  if (!rawJson) {
    throw new Error('Groq API returned an empty or invalid response.');
  }

  let parsed: { events?: any[] };
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  }

  const rawEventsList = Array.isArray(parsed?.events) ? parsed.events : [];

  const extractedEvents: ExtractedEvent[] = rawEventsList.map((rawEvent: any, index: number) => {
    const validTypes: EventType[] = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
    const validModes: EventMode[] = ['online', 'offline', 'hybrid'];

    const type: EventType = validTypes.includes(rawEvent.type?.toLowerCase())
      ? rawEvent.type.toLowerCase()
      : 'other';

    const mode: EventMode = validModes.includes(rawEvent.mode?.toLowerCase())
      ? rawEvent.mode.toLowerCase()
      : 'online';

    const startDate = isValidDateFormat(rawEvent.event_start_date) ? rawEvent.event_start_date : null;
    const endDate = isValidDateFormat(rawEvent.event_end_date) ? rawEvent.event_end_date : null;
    const regDeadline = isValidDateFormat(rawEvent.registration_deadline)
      ? rawEvent.registration_deadline
      : null;

    let confidence = typeof rawEvent.confidence_score === 'number' ? rawEvent.confidence_score : 0.8;
    if (!startDate && !regDeadline) {
      confidence = Math.min(confidence, 0.5);
    }

    return {
      temp_id: `ext_${Date.now()}_${index}`,
      title: rawEvent.title?.trim() || 'Untitled Event',
      type,
      event_start_date: startDate,
      event_end_date: endDate,
      registration_deadline: regDeadline,
      time: rawEvent.time?.trim() || null,
      mode,
      location: rawEvent.location?.trim() || null,
      registration_link: sanitizeUrl(rawEvent.registration_link),
      source_group: rawEvent.source_group?.trim() || null,
      raw_text: trimmedText,
      confidence_score: Math.max(0, Math.min(1, confidence)),
      tags: [type, mode],
      reminder_offsets: [4320, 1440, 0],
    };
  });

  return {
    events: extractedEvents,
    raw_input: trimmedText,
    extracted_at: new Date().toISOString(),
  };
}
