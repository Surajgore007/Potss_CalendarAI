# Google Play Store Data Safety Questionnaire Guide

**App Name:** Vanko: Smart Campus Calendar  
**Package Name:** `com.suraj.eventpulse`  
**Privacy Policy URL:** `https://vanko-api.vanko-app.workers.dev/privacy-policy`  
**Account Deletion URL:** `https://vanko-api.vanko-app.workers.dev/delete-account`  
**Version:** 1.0.0 (September 2026)  

Use this document to answer the **Data Safety** section in Google Play Console with 100% technical fidelity to the codebase.

---

## 1. Overview Questions

| Question | Answer | Notes |
| :--- | :--- | :--- |
| Does your app collect or share any of the required user data types? | **Yes** | Collects user email, name, calendar events, device push tokens, and feedback. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Enforces TLS 1.3 across all client-to-edge and database connections. |
| Do you provide a way for users to request that their data be deleted? | **Yes** | Available in-app (*Settings > Delete My Account*) and via public web portal (`/delete-account`). |
| Enter URL for deletion request: | `https://vanko-api.vanko-app.workers.dev/delete-account` | Public, responsive web page with email OTP verification. |

---

## 2. Detailed Data Types & Declarations

### A. Personal Info

#### 1. Name
- **Collected?** Yes
- **Shared?** No (Never shared with third parties for commercial/marketing purposes)
- **Purposes:**
  - App functionality (Personalized greetings, schedule attribution)
  - Account management
- **Ephemeral?** No (Stored in Firebase Auth and Firestore until deleted)
- **Optional or Required?** Optional (defaults to username if omitted)

#### 2. Email Address
- **Collected?** Yes
- **Shared?** No
- **Purposes:**
  - App functionality (Account authentication, password reset)
  - Account management
- **Ephemeral?** No
- **Optional or Required?** Required (Primary account key)

#### 3. User IDs (Firebase UID)
- **Collected?** Yes
- **Shared?** No
- **Purposes:**
  - App functionality (Access control, data isolation)
  - Analytics / developer communication
- **Ephemeral?** No
- **Optional or Required?** Required

---

### B. Calendar

#### 1. Calendar Events
- **Collected?** Yes
- **Shared?** No (Data sent to Groq Inc. for AI entity extraction is processed statelessly in real-time under commercial DPA without retention or model training)
- **Purposes:**
  - App functionality (Core schedule storage, timetable synchronization, deadline reminders)
- **Ephemeral?** No (Stored until deleted by user)
- **Optional or Required?** Required (Core function of the app)

---

### C. Messages & Feedback

#### 1. User Feedback & Customer Support
- **Collected?** Yes
- **Shared?** No (Restricted strictly to platform developers via admin-only channel)
- **Purposes:**
  - Customer support
  - Product improvement & bug fixing
- **Ephemeral?** No (Stored up to 12 months)
- **Optional or Required?** Optional (User voluntarily submits)

---

### D. Device or Other IDs

#### 1. Device or Other IDs (Expo / FCM Push Tokens)
- **Collected?** Yes
- **Shared?** No
- **Purposes:**
  - App functionality (Dispatching 24h deadline reminder notifications)
- **Ephemeral?** No (Stored while logged in; unregistered on sign-out/deletion)
- **Optional or Required?** Optional (Can be toggled off under *Settings > Manage Data Consents*)

---

## 3. Security & Account Deletion Verification

1. **Data Transfer Encryption:** All network traffic uses HTTPS (TLS 1.3).
2. **Account Deletion Flow:**
   - In-app deletion requires recent re-authentication (<5 minutes).
   - Deletion state machine hard-deletes events, profiles, and authentication records.
   - Client cleans up local AsyncStorage and unregisters push tokens.
   - Public web deletion portal verifies ownership via 6-digit email OTP before queueing deletion.
   - 90-day retention on `/accountDeletionAudit` strictly for DPBI regulatory dispute compliance.
