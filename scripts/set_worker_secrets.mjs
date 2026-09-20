import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), 'calendarai-f5cd0-firebase-adminsdk-fbsvc-0ae43407dc.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account file not found:', serviceAccountPath);
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
const clientEmail = sa.client_email;
const privateKey = sa.private_key;

if (!clientEmail || !privateKey) {
  console.error('Invalid service account file: client_email or private_key missing');
  process.exit(1);
}

function putSecret(secretName, secretValue) {
  return new Promise((resolve, reject) => {
    console.log(`Setting wrangler secret ${secretName}...`);
    const isWindows = process.platform === 'win32';
    const child = spawn('npx', ['wrangler', 'secret', 'put', secretName], {
      cwd: path.resolve(process.cwd(), 'services/worker'),
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    });

    child.stdin.write(secretValue);
    child.stdin.end();

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`Successfully set ${secretName}!`);
        resolve();
      } else {
        reject(new Error(`wrangler secret put ${secretName} exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  try {
    await putSecret('FIREBASE_CLIENT_EMAIL', clientEmail);
    await putSecret('FIREBASE_PRIVATE_KEY', privateKey);
    console.log('\nAll Firebase service account secrets successfully configured in Cloudflare Worker!');
  } catch (err) {
    console.error('Failed to set secrets:', err);
    process.exit(1);
  }
}

main();
