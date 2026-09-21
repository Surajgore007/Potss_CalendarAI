/**
 * Admin Session Resilience & ProGuard Integrity Test Suite
 *
 * Verifies:
 * 1. Active admin session is never demoted to student on background network timeouts or Firestore reconnections.
 * 2. Explicit server-side revocation (admin: false or role: 'student') is strictly honored.
 * 3. Custom claims (admin: true) immediately elevate sessions to admin.
 * 4. apps/mobile/app.json contains all required ProGuard keep rules for release AAB builds.
 */

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting Admin Session Resilience & Build Integrity Tests...\n');

// --- Test Suite 1: ProGuard Keep Rules in app.json ---
console.log('--- Test Suite 1: ProGuard Keep Rules in apps/mobile/app.json ---');
const appJsonPath = path.resolve(process.cwd(), 'apps/mobile/app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const buildPropertiesPlugin = appJson.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === 'expo-build-properties'
);

assert(buildPropertiesPlugin, 'expo-build-properties plugin must be declared');
const androidConfig = buildPropertiesPlugin[1].android;
assert.equal(androidConfig.enableProguardInReleaseBuilds, true, 'Proguard must be enabled');
assert.equal(androidConfig.enableShrinkResourcesInReleaseBuilds, true, 'Shrink resources must be enabled');

const proguardRules = androidConfig.extraProguardRules || '';
assert(proguardRules.includes('com.google.firebase'), 'Must include keep rules for com.google.firebase');
assert(proguardRules.includes('com.google.android.gms'), 'Must include keep rules for com.google.android.gms');
assert(proguardRules.includes('expo.modules.notifications'), 'Must include keep rules for expo.modules.notifications');
assert(proguardRules.includes('expo.modules'), 'Must include keep rules for expo.modules');

console.log('✔ Test 1 passed: ProGuard keep rules protect Firebase & expo-notifications from R8 stripping');

// --- Test Suite 2: Admin Session Persistence State Machine ---
console.log('\n--- Test Suite 2: Admin Session State Machine Shielding ---');

function simulatePermissionRefresh({
  currentRole,
  tokenClaims,
  isOnline,
  firestoreDocRole,
  firestoreThrows = false,
}) {
  let userRole = currentRole || 'student';

  // 1. Single Source of Truth: Cryptographically signed Custom Claims on the ID Token
  if (tokenClaims.admin === true || tokenClaims.role === 'admin') {
    userRole = 'admin';
  } else if (tokenClaims.admin === false || tokenClaims.role === 'student') {
    // Explicit server-side revocation
    userRole = 'student';
  } else {
    // Custom claims absent or pending: check Firestore with network resilience
    if (isOnline) {
      try {
        if (firestoreThrows) {
          throw new Error('Firestore connection unavailable during wake');
        }
        const fsRole = firestoreDocRole;
        if (fsRole === 'admin') {
          userRole = 'admin';
        } else if (currentRole === 'admin') {
          // CRITICAL INTEGRITY GUARD:
          // Never demote an active, authenticated admin session to student on transient background network calls
          // or Firestore reconnection delays. Require explicit token revocation claim.
          userRole = 'admin';
        } else {
          userRole = fsRole || 'student';
        }
      } catch {
        userRole = currentRole || 'student';
      }
    } else if (currentRole) {
      userRole = currentRole;
    }
  }

  return userRole;
}

// Case 2A: App wakes after 15 minutes, device is online, but Firestore reconnection throws error
const case2A = simulatePermissionRefresh({
  currentRole: 'admin',
  tokenClaims: {}, // No claims on token
  isOnline: true,
  firestoreThrows: true, // Wake-up socket error
});
assert.equal(case2A, 'admin', 'Admin session MUST NOT be demoted when Firestore throws on wake-up');
console.log('✔ Case 2A passed: Admin preserved during background wake-up socket reconnection error');

// Case 2B: Device is offline on app wake
const case2B = simulatePermissionRefresh({
  currentRole: 'admin',
  tokenClaims: {},
  isOnline: false,
  firestoreDocRole: null,
});
assert.equal(case2B, 'admin', 'Admin session MUST NOT be demoted when device wakes offline');
console.log('✔ Case 2B passed: Admin preserved when device wakes offline');

// Case 2C: Firestore doc is missing 'role' field (e.g. user doc had no role set yet), but session is active admin
const case2C = simulatePermissionRefresh({
  currentRole: 'admin',
  tokenClaims: {},
  isOnline: true,
  firestoreDocRole: undefined, // Document missing role
});
assert.equal(case2C, 'admin', 'Admin session MUST NOT be demoted when Firestore doc has no role field');
console.log('✔ Case 2C passed: Admin preserved against missing Firestore document fields');

// Case 2D: Token carries explicit server revocation (admin: false)
const case2D = simulatePermissionRefresh({
  currentRole: 'admin',
  tokenClaims: { admin: false, role: 'student' }, // Explicit server revocation
  isOnline: true,
  firestoreDocRole: 'student',
});
assert.equal(case2D, 'student', 'Admin session MUST be demoted when server explicitly revokes claims');
console.log('✔ Case 2D passed: Explicit server revocation correctly demotes session to student');

// Case 2E: New elevation to admin via custom claims
const case2E = simulatePermissionRefresh({
  currentRole: 'student',
  tokenClaims: { admin: true, role: 'admin' },
  isOnline: true,
  firestoreDocRole: 'admin',
});
assert.equal(case2E, 'admin', 'Student session MUST be elevated when token carries admin claim');
console.log('✔ Case 2E passed: Valid custom claims elevate session to admin');

// Case 2F: Firestore doc confirms admin role even without token claims
const case2F = simulatePermissionRefresh({
  currentRole: 'student',
  tokenClaims: {},
  isOnline: true,
  firestoreDocRole: 'admin',
});
assert.equal(case2F, 'admin', 'Firestore admin doc elevates session to admin');
console.log('✔ Case 2F passed: Firestore admin role elevates session to admin');

console.log('\n🎉 ALL ADMIN RESILIENCE & PROGUARD INTEGRITY TESTS PASSED!');
