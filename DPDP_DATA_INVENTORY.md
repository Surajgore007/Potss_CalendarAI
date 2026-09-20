# Record of Processing Activities (ROPA) & Data Inventory

**Application:** Vanko (EventPulse)  
**Package:** `com.suraj.eventpulse`  
**Statutory Reference:** Section 8, Digital Personal Data Protection Act, 2023 (India)  
**Data Fiduciary:** Vanko Data Governance & Privacy Desk  
**Last Updated:** September 13, 2026  

---

## 1. Data Processing Inventory Matrix

| Data Element | Category | Processing Purpose | Lawful Basis | Storage System | Encryption | Retention Period | Disposal / Erasure Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Email Address** | Identity / Account | User authentication, account recovery, security alerts | Consent (DPDP Sec 6) | Firebase Auth & Firestore `/users/{uid}` | In transit: TLS 1.3<br>At rest: AES-256 | Retained until account deletion | Hard-deleted via Identity Toolkit & Firestore delete |
| **Display Name** | Identity / Profile | Personalized schedule display & community badges | Consent (DPDP Sec 6) | Firebase Auth & Firestore `/users/{uid}` | In transit: TLS 1.3<br>At rest: AES-256 | Retained until account deletion or profile update | User editable in app; hard-deleted upon account closure |
| **User ID (UID)** | Pseudonymous Identifier | Access control, data isolation, multi-tenant scoping | Consent (DPDP Sec 6) | Firebase Auth & Firestore doc paths | In transit: TLS 1.3<br>At rest: AES-256 | Retained until account deletion | Hard-deleted upon account deletion |
| **Calendar Events** | Schedule / Activity | Timetable display, clash detection, reminder scheduling | Consent (DPDP Sec 6) | Firestore `/users/{uid}/events/{eventId}` | In transit: TLS 1.3<br>At rest: AES-256 | Retained until manual event deletion or account deletion | Deleted individually by user or batch-purged on account deletion |
| **Push Notification Tokens** | Device Identifier | Dispatching 24h deadline reminders | Consent (DPDP Sec 6) | Firestore `/users/{uid}.pushToken` | In transit: TLS 1.3<br>At rest: AES-256 | Retained until token change, sign-out, or account deletion | Unregistered via Expo push service & deleted from Firestore |
| **Notice Text for AI Extraction** | User-Provided Content | Extracting event title, date, time, mode, and link | Consent (DPDP Sec 6) | Sent to Groq Inc. via Cloudflare Worker | In transit: TLS 1.3<br>At rest: **Zero** | **0 seconds (Stateless):** Processed in real-time, never stored or cached | Discarded immediately after inference by Groq |
| **Feedback Submissions** | User Correspondence | Bug fixing, product improvement (Admin-only) | Consent (DPDP Sec 6) | Firestore `/feedback/{id}` & Cloud Storage | In transit: TLS 1.3<br>At rest: AES-256 | 12 months from submission date | Purged during periodic maintenance |
| **Account Deletion Audit Record** | Regulatory Ledger | Audit trail, dispute resolution, DPBI compliance | Statutory Compliance (DPDP Sec 12) | Firestore `/accountDeletionAudit/{uid}` | In transit: TLS 1.3<br>At rest: AES-256 | **Exactly 90 days** from deletion | Automatically purged via TTL field (`expireAt`) & worker cron |

---

## 2. Technical Security Controls & Access Architecture

### 2.1 Encryption Standards
- **Data in Transit:** Enforced TLS 1.3 with modern cipher suites across all mobile-to-edge and edge-to-database connections.
- **Data at Rest:** Google Cloud Firestore and Cloud Storage enforce transparent data encryption using 256-bit Advanced Encryption Standard (AES-256).

### 2.2 Role-Based Access Control (RBAC) & Custom Claims
- **Zero Document-Level Admin Trust:** Privilege escalation vectors are mitigated by maintaining admin roles in cryptographically signed Firebase Auth Custom Claims (`payload.admin === true`), never in mutable Firestore documents.
- **Service Account Isolation:** Backend-only collections (`/feedback`, `/deletionRequests`, `/deletionVerificationCodes`, `/accountDeletionAudit`, `/extractionUsage`) are explicitly blocked from client SDK access via `firestore.rules` (`allow read, write: if false;`).

### 2.3 Edge Abuse Mitigation
- **IP Token Bucket:** Sliding-window rate limiting of 60 requests per minute per IP for extraction endpoints.
- **UID Token Bucket:** Feedback submissions capped at 5 per user per 24 hours.
- **Dual OTP Rate Limiting:** Public deletion OTP requests capped at 3 per IP per hour AND 3 per target email per hour to prevent inbox harassment.

---

## 3. Subprocessor Data Flows

```
[Student Device]
      |  (TLS 1.3 / Authenticated ID Token)
      v
[Cloudflare Worker Edge (eventpulse-api)]
      |--------------------------------------------------|
      | (Unstructured Event Text)                        | (Encrypted Profile/Events)
      v                                                  v
[Groq, Inc. API (USA)]                           [Google Firebase (Datastore / Auth)]
- Stateless LLM Inference                        - Firestore AES-256
- Zero Training / Retention                      - Identity Toolkit REST
- No User Credentials Transmitted                - Cloud Storage (Attachments)
```
