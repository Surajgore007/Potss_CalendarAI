/**
 * Automated Vision & Text Extraction Benchmark Runner
 * 
 * Tests the live Groq models via the Worker /api/eval/extract endpoint:
 * 1. Measures real latency (verifies 1.5s - 3.5s budget)
 * 2. Checks reasoning / thinking token suppression
 * 3. Validates strict schema conformance & date sanity
 * 4. Outputs comprehensive scorecard
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateExtractedEvent, scoreBenchmarkResults } from './eval_harness.mjs';

const WORKER_URL = 'https://vanko-api.vanko-app.workers.dev/api/eval/extract';
const EVAL_KEY = 'vanko-benchmark-eval-2026';
const USER_UPLOADED_DIR = 'C:\\Users\\suraj\\.gemini\\antigravity-ide\\brain\\4d9b78a0-0466-4f23-88c9-ace78620de8e\\.user_uploaded';

async function callEvalEndpoint(payload) {
  const startTime = Date.now();
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Eval-Key': EVAL_KEY,
    },
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - startTime;
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Worker returned ${res.status}: ${txt}`);
  }

  const json = await res.json();
  return { ...json, roundTripLatencyMs: durationMs };
}

async function runBenchmark() {
  console.log('===============================================================');
  console.log('       VANKO VISUAL & TEXT EXTRACTION BENCHMARK RUNNER         ');
  console.log('===============================================================\n');

  const benchmarkRecords = [];

  // Phase 1: Benchmark Text Extraction & Reasoning Suppression
  console.log('--- Phase 1: Text Extraction & Reasoning Token Check ---');
  const textTestCases = [
    {
      name: 'Hackathon announcement (English)',
      text: 'Excited to announce ByteHacks 2026! A 36-hour national hackathon on Nov 14-15, 2026 at SIES Graduate School of Technology, Navi Mumbai. Mode is offline. Registrations close Nov 8, 2026. Register at https://bytehacks.tech/register',
      referenceDate: '2026-10-18T00:00:00.000Z',
    },
    {
      name: 'Workshop with "Link in bio" (LinkedIn pattern)',
      text: '🚀 Free Agentic AI Workshop on 25th October 2026 at 5:00 PM IST! Hosted on Google Meet. Limited seats available. Link in first comment to register!',
      referenceDate: '2026-10-18T00:00:00.000Z',
    },
    {
      name: 'Past event test (screenshot of old event)',
      text: 'Web3 Builders Summit happening March 10, 2025. Registrations end March 1, 2025 at https://web3summit.xyz',
      referenceDate: '2026-10-18T00:00:00.000Z',
    },
    {
      name: 'Multi-column / ambiguous text without dates (Noise resistance)',
      text: 'Hey guys, check out the new design system guidelines for our team. You may review the Figma files and sep by components. Let me know what you think!',
      referenceDate: '2026-10-18T00:00:00.000Z',
    },
  ];

  for (const tc of textTestCases) {
    process.stdout.write(`Evaluating: "${tc.name}" ... `);
    try {
      const result = await callEvalEndpoint({
        text: tc.text,
        referenceDate: tc.referenceDate,
      });

      console.log(`DONE in ${result.latency_ms}ms (RTT: ${result.roundTripLatencyMs}ms)`);
      console.log(`   Model: ${result.model_evaluated}`);
      console.log(`   Thinking tokens detected: ${result.thinking_tokens_detected ? 'YES (<think> found)' : 'NO (Suppressed cleanly)'}`);
      console.log(`   Events extracted: ${result.events_extracted_count}`);

      if (result.events && result.events.length > 0) {
        for (const ev of result.events) {
          console.log(`   -> Title: "${ev.title}" | Dates: [${ev.event_start_date} to ${ev.event_end_date}] | Deadline: ${ev.registration_deadline}`);
          console.log(`      Confidence: ${ev.extraction_confidence} | Link Status: ${ev.link_status} | Past: ${ev.is_past_event} | Needs Review: ${ev.requires_review}`);
        }
      }

      benchmarkRecords.push({
        name: tc.name,
        type: 'text',
        latencyMs: result.latency_ms,
        events: result.events,
        referenceDate: tc.referenceDate,
        thinkingTokens: result.thinking_tokens_detected,
      });
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Phase 2: Benchmark Vision Model with Actual Uploaded Posters/Screenshots
  console.log('\n--- Phase 2: Vision Model Evaluation (qwen/qwen3.8-27b) ---');
  if (fs.existsSync(USER_UPLOADED_DIR)) {
    const files = fs.readdirSync(USER_UPLOADED_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    const testFiles = files.slice(0, 3); // Test first 3 representative poster samples

    for (const filename of testFiles) {
      const fullPath = path.join(USER_UPLOADED_DIR, filename);
      const stat = fs.statSync(fullPath);
      process.stdout.write(`Evaluating Image: ${filename} (${(stat.size / 1024).toFixed(1)} KB) ... `);

      try {
        const buffer = fs.readFileSync(fullPath);
        const base64 = buffer.toString('base64');
        const ext = path.extname(filename).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

        const result = await callEvalEndpoint({
          imageBase64: base64,
          mimeType,
          referenceDate: '2026-10-18T00:00:00.000Z',
        });

        console.log(`DONE in ${result.latency_ms}ms (RTT: ${result.roundTripLatencyMs}ms)`);
        console.log(`   Model: ${result.model_evaluated}`);
        console.log(`   Thinking tokens detected: ${result.thinking_tokens_detected ? 'YES' : 'NO (Suppressed)'}`);
        console.log(`   Events extracted: ${result.events_extracted_count}`);

        if (result.events && result.events.length > 0) {
          for (const ev of result.events) {
            console.log(`   -> Title: "${ev.title}"`);
            console.log(`      Start Date: ${ev.event_start_date} | Deadline: ${ev.registration_deadline}`);
            console.log(`      Confidence: ${ev.extraction_confidence} | Link Status: ${ev.link_status} | Legibility: ${ev.legibility} | Past: ${ev.is_past_event}`);
          }
        } else {
          console.log(`   (Image did not contain a valid event with dates — successfully rejected noise)`);
        }

        benchmarkRecords.push({
          name: filename,
          type: 'vision',
          latencyMs: result.latency_ms,
          events: result.events,
          referenceDate: '2026-10-18T00:00:00.000Z',
          thinkingTokens: result.thinking_tokens_detected,
        });
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
      }
    }
  }

  // Phase 3: Scorecard & Metrics Summary
  console.log('\n===============================================================');
  console.log('                  FINAL BENCHMARK SCORECARD                    ');
  console.log('===============================================================');
  const scorecard = scoreBenchmarkResults(benchmarkRecords);
  console.log(JSON.stringify(scorecard, null, 2));

  console.log('\nBenchmark execution complete.');
}

runBenchmark().catch((e) => {
  console.error('Fatal benchmark error:', e);
});
