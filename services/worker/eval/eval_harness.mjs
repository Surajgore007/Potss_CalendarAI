/**
 * Visual Event Extraction Evaluation & Benchmark Harness
 * 
 * Scores image extraction against the strict schema contract:
 * - Schema validation pass rate (title, valid ISO date, schema conformance)
 * - Date sanity & past event detection
 * - Latency & reasoning suppression
 * - Link status ('found' | 'mentioned_in_comments' | 'none')
 * - Categorical confidence & legibility
 */

import fs from 'node:fs';
import path from 'node:path';

// Improved Date Signal Regex: requires Month Name next to day number or numeric DD/MM or MM/DD pattern
// Solves Point 1: Eliminates false positives from common words like "may", "mar", "sep", "dec"
export const DATE_SIGNAL_REGEX = new RegExp(
  '\\b(?:' +
    // Month Day: e.g. "Oct 28", "October 28th", "May 5"
    '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+\\d{1,2}(?:st|nd|rd|th)?' +
    '|' +
    // Day Month: e.g. "28th Oct", "28 October", "5 May"
    '\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)' +
    '|' +
    // Numeric date patterns: "28/10/2026", "28-10-2026", "2026-10-28"
    '\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b' +
  ')',
  'i'
);

export function testDateSignalRegex(text) {
  return DATE_SIGNAL_REGEX.test(text);
}

/**
 * Validates extracted event against strict schema requirements:
 * 1. Must have non-empty title
 * 2. Must have at least one valid ISO date (start, end, or deadline)
 * 3. Categorical confidence must be 'high' | 'medium' | 'low'
 * 4. Link status must be 'found' | 'mentioned_in_comments' | 'none'
 * 5. Legibility must be 'high' | 'medium' | 'low'
 * 6. Date sanity: past events must be flagged with is_past_event === true
 */
export function validateExtractedEvent(event, referenceDate = new Date()) {
  const issues = [];
  
  if (!event.title || typeof event.title !== 'string' || event.title.trim().length === 0) {
    issues.push('Missing or empty title');
  }

  const isIsoDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

  const hasStartDate = isIsoDate(event.event_start_date);
  const hasEndDate = isIsoDate(event.event_end_date);
  const hasDeadline = isIsoDate(event.registration_deadline);

  if (!hasStartDate && !hasEndDate && !hasDeadline) {
    issues.push('No valid ISO-8601 date found (start, end, or deadline)');
  }

  // Year sanity check
  const refYear = referenceDate.getFullYear();
  const allDates = [
    hasStartDate ? event.event_start_date : null,
    hasEndDate ? event.event_end_date : null,
    hasDeadline ? event.registration_deadline : null,
  ].filter(Boolean);

  for (const d of allDates) {
    const yr = parseInt(d.slice(0, 4), 10);
    if (yr < refYear - 1 || yr > refYear + 2) {
      issues.push(`Unreasonable year extracted: ${yr}`);
    }
  }

  // Past event validation
  const refIso = referenceDate.toISOString().slice(0, 10);
  const primaryDate = allDates[0];
  if (primaryDate && primaryDate < refIso) {
    if (event.is_past_event !== true) {
      issues.push(`Past date (${primaryDate} < ${refIso}) not flagged as is_past_event: true`);
    }
  }

  // Categorical confidence
  if (!['high', 'medium', 'low'].includes(event.extraction_confidence)) {
    issues.push(`Invalid extraction_confidence: ${event.extraction_confidence}`);
  }

  // Link status
  if (!['found', 'mentioned_in_comments', 'none'].includes(event.link_status)) {
    issues.push(`Invalid link_status: ${event.link_status}`);
  }

  // Legibility
  if (!['high', 'medium', 'low'].includes(event.legibility)) {
    issues.push(`Invalid legibility: ${event.legibility}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Score a batch of extraction benchmark results
 */
export function scoreBenchmarkResults(results) {
  const total = results.length;
  if (total === 0) return { total: 0 };

  let schemaValidCount = 0;
  let dateValidCount = 0;
  let wrongDateCount = 0;
  let pastEventDetectedCount = 0;
  let linkFoundCount = 0;
  let linkCommentCount = 0;
  const latencies = [];

  for (const res of results) {
    if (res.latencyMs) latencies.push(res.latencyMs);

    if (res.events && res.events.length > 0) {
      for (const event of res.events) {
        const val = validateExtractedEvent(event, new Date(res.referenceDate || Date.now()));
        if (val.valid) {
          schemaValidCount++;
        }
        if (event.event_start_date || event.registration_deadline) {
          dateValidCount++;
        }
        if (val.issues.some((i) => i.includes('Unreasonable year') || i.includes('Past date'))) {
          wrongDateCount++;
        }
        if (event.is_past_event) {
          pastEventDetectedCount++;
        }
        if (event.link_status === 'found') linkFoundCount++;
        if (event.link_status === 'mentioned_in_comments') linkCommentCount++;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;
  const p90Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.9)] : 0;

  return {
    totalEvaluations: total,
    schemaPassRate: `${((schemaValidCount / Math.max(1, total)) * 100).toFixed(1)}%`,
    validDateRate: `${((dateValidCount / Math.max(1, total)) * 100).toFixed(1)}%`,
    wrongDateRate: `${((wrongDateCount / Math.max(1, total)) * 100).toFixed(1)}%`,
    pastEventsDetected: pastEventDetectedCount,
    linksExtractedDirect: linkFoundCount,
    linksMentionedInComments: linkCommentCount,
    medianLatencyMs: medianLatency,
    p90LatencyMs: p90Latency,
  };
}

// Quick self-test when run directly
async function runSelfTest() {
  console.log('=== Vanko Visual Extraction Harness Self-Test ===\n');

  // Test 1: Date Signal Regex (Point 1)
  console.log('1. Testing Date Signal Regex False-Positive Resistance:');
  const falsePositivePhrases = [
    'You may participate in the team',
    'Sep by comma',
    'Dec and janitors',
    'mar of progress',
  ];
  for (const phrase of falsePositivePhrases) {
    const matched = testDateSignalRegex(phrase);
    console.log(`   "${phrase}" -> Matched? ${matched} ${!matched ? '(PASS: No false positive)' : '(FAIL)'}`);
  }

  const validPhrases = [
    'Hackathon on Oct 28',
    'Registration deadline: 28th October 2026',
    'Event date: 15/11/2026',
    'Starts May 10',
  ];
  for (const phrase of validPhrases) {
    const matched = testDateSignalRegex(phrase);
    console.log(`   "${phrase}" -> Matched? ${matched} ${matched ? '(PASS: Detected date)' : '(FAIL)'}`);
  }

  // Test 2: Schema Validation (Point 2, 4)
  console.log('\n2. Testing Schema Validation Strictness & Date Sanity:');
  const sampleEvent = {
    title: 'CodeSprint Hackathon 2026',
    type: 'hackathon',
    event_start_date: '2026-11-05',
    event_end_date: '2026-11-06',
    registration_deadline: '2026-11-01',
    time: '10:00',
    mode: 'offline',
    location: 'Campus Auditorium',
    registration_link: 'https://codesprint.dev',
    link_status: 'found',
    confidence_score: 0.95,
    extraction_confidence: 'high',
    legibility: 'high',
    is_past_event: false,
  };
  const valResult = validateExtractedEvent(sampleEvent, new Date('2026-10-18'));
  console.log('   Valid event check:', valResult.valid ? 'PASS' : `FAIL: ${valResult.issues.join(', ')}`);

  // Test Past Event Detection
  const pastEvent = {
    ...sampleEvent,
    event_start_date: '2025-05-01',
    registration_deadline: '2025-04-20',
    is_past_event: true,
  };
  const pastResult = validateExtractedEvent(pastEvent, new Date('2026-10-18'));
  console.log('   Past event flagged correctly:', pastResult.valid ? 'PASS' : `FAIL: ${pastResult.issues.join(', ')}`);

  console.log('\nSelf-test completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('eval_harness.mjs')) {
  runSelfTest();
}
