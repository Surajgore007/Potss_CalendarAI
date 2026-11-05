import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

try {
  // Dump databases/RKStorage from the connected device
  const tempDb = path.resolve('temp_rkstorage.db');
  console.log('Extracting local storage from connected device...');
  execSync(`adb exec-out run-as com.suraj.eventpulse cat databases/RKStorage > "${tempDb}"`);

  const fileBuffer = fs.readFileSync(tempDb);
  const content = fileBuffer.toString('utf8');

  // Look for Firebase Auth STS Token or JWT
  const jwtRegex = /eyJh[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
  const matches = content.match(jwtRegex) || [];

  console.log(`Found ${matches.length} JWT matches in local storage.`);

  const validTokens = [];
  for (const token of matches) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.iss && payload.iss.includes('securetoken.google.com')) {
          validTokens.push({
            token,
            uid: payload.user_id || payload.sub,
            email: payload.email,
            exp: new Date(payload.exp * 1000).toLocaleString(),
            isExpired: payload.exp * 1000 < Date.now(),
          });
        }
      }
    } catch (e) {}
  }

  if (validTokens.length > 0) {
    console.log('\n=== Active Vanko Firebase Tokens on Device ===');
    for (const t of validTokens) {
      console.log(`\nUser: ${t.email || t.uid}`);
      console.log(`Expires: ${t.exp} (Expired: ${t.isExpired})`);
      console.log(`Token: \n${t.token}`);
    }
  } else {
    console.log('No valid Firebase JWT tokens found in RKStorage. User might need to open app or log in.');
  }

  // Cleanup
  if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
} catch (err) {
  console.error('Error extracting device token:', err.message);
}

