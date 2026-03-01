import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_URL = 'http://localhost:8000';
const STATE_FILE = path.join(__dirname, '.e2e-state.json');

const DEFAULT_BUGREPORT = path.join(
  PROJECT_ROOT,
  'sample-bugreports',
  'bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip'
);

/**
 * Global setup: upload a bugreport and wait for analysis to complete.
 * Writes the analysisId to a state file for test workers to read.
 */
export default async function globalSetup() {
  console.log('[global-setup] Uploading sample bugreport...');

  if (!fs.existsSync(DEFAULT_BUGREPORT)) {
    throw new Error(`Sample bugreport not found: ${DEFAULT_BUGREPORT}`);
  }

  // Upload the bugreport
  const fileBuffer = fs.readFileSync(DEFAULT_BUGREPORT);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  const formData = new FormData();
  formData.append('file', blob, path.basename(DEFAULT_BUGREPORT));

  const uploadRes = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const { id } = (await uploadRes.json()) as { id: string };
  console.log(`[global-setup] Upload successful, id=${id}`);

  // Start analysis and wait for completion via SSE
  console.log('[global-setup] Starting analysis (Quick mode)...');
  const sseRes = await fetch(`${BACKEND_URL}/api/analyze/${id}?mode=quick`);
  if (!sseRes.ok || !sseRes.body) {
    throw new Error(`Analysis SSE failed: ${sseRes.status}`);
  }

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let done = false;

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.step === 'complete' || data.status === 'complete') {
          done = true;
          break;
        }
        if (data.step === 'error' || data.status === 'error') {
          throw new Error(`Analysis error: ${data.message || JSON.stringify(data)}`);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  console.log(`[global-setup] Analysis complete. TEST_ANALYSIS_ID=${id}`);

  // Write state to file for worker processes to read
  fs.writeFileSync(STATE_FILE, JSON.stringify({ analysisId: id }));

  // Also set env var for same-process access
  process.env.TEST_ANALYSIS_ID = id;
}
