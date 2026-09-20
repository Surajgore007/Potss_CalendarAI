# Privacy Policy — Vanko (EventPulse)

**Effective Date:** September 13, 2026  
**Application Package:** `com.suraj.eventpulse`  
**Governing Regulation:** Digital Personal Data Protection Act, 2023 (India) & Google Play Store Developer Policies  

---

## 1. Data Fiduciary & Identity Details

This Privacy Policy governs the mobile application **Vanko**. Under the **Digital Personal Data Protection Act, 2023 (DPDP)**, the Data Fiduciary responsible for processing your personal data is:

- **Data Fiduciary:** Vanko Data Governance & Privacy Desk
- **Official Privacy Email:** [privacy@vanko.app](mailto:privacy@vanko.app)
- **General Inquiries:** [privacy@vanko.app](mailto:privacy@vanko.app)
- **In-App Redressal:** Settings > Send Feedback / Suggestion

---

## 2. Categories of Personal Data Collected

We collect and process strictly the minimum personal data required to deliver smart schedule synchronization, on-device notifications, and AI entity extraction:

1. **Account Identification Data:**
   - Email address, display name, and unique Firebase Authentication user ID (UID).
   - Collected directly upon registration via email/password or Google Single Sign-On.
2. **Schedule & Calendar Data:**
   - Event titles, dates, start/end times, registration deadlines, modes (online/offline/hybrid), locations, and user-provided notes.
   - Collected when you create an event or extract events from informal text.
3. **Device & Notification Identifiers:**
   - Device push notification tokens (Expo Push / Google Firebase Cloud Messaging).
   - Used exclusively to schedule and deliver 24-hour deadline reminders for events you have saved.
4. **User-Initiated Feedback Submissions:**
   - Feedback category (bug, suggestion, complaint, other), message text, and optional screenshot image attachments voluntarily provided through the in-app feedback channel.
   - Automatically accompanied by client platform (`android`/`ios`) and app version (`1.0.0`) to aid debugging.

---

## 3. Lawful Grounds & Purpose Limitation (DPDP Section 4 & 6)

Personal data is collected and processed based exclusively on your **unbundled, informed, and affirmative opt-in consent** granted during account creation. 

The specified purposes are:
- Storing, synchronizing, and displaying your academic and extracurricular schedule across your authorized devices.
- Converting unstructured announcement notices that you voluntarily submit into structured calendar events via high-speed AI parsing.
- Delivering automated deadline reminders 24 hours prior to registration closing dates.
- Reviewing and addressing user bug reports and feature suggestions through an admin-only, private feedback channel.

We do **not** sell, rent, license, or monetize your personal data. We do not display third-party advertisements or engage in cross-app behavioral tracking.

---

## 4. Third-Party Subprocessors & Cross-Border Data Transfers (DPDP Section 16)

To operate our cloud infrastructure, we partner with specialized, security-certified subprocessors. Where data is transferred internationally, such transfers comply with Section 16 of the DPDP Act 2023 (transfers permitted except to jurisdictions blacklisted by the Central Government):

| Subprocessor | Location | Role & Data Transferred | Data Protection & Retention Terms |
| :--- | :--- | :--- | :--- |
| **Groq, Inc.** | United States (Cross-Border) | **AI Entity Extraction:** Raw calendar text or announcement snippets submitted by the user. | **Stateless Real-Time Processing:** Transmitted via TLS 1.3. Under Groq's Commercial Terms of Service, inputs are processed statelessly in real-time, are never retained past inference, and are never used to train or improve AI models. **User account credentials (emails, passwords, or phone numbers) are never transmitted to Groq.** Notice text may contain personal details (e.g. names, meeting locations) entered by the user. |
| **Google Cloud / Firebase** | USA / India / Global | **Authentication & Database:** Email, user credentials, encrypted Firestore schedule documents (AES-256), and cloud storage attachments. | Hosted on ISO 27001, SOC 1/2/3 certified Google Cloud infrastructure. Data at rest is encrypted with AES-256; data in transit is encrypted with TLS 1.3. |
| **Cloudflare, Inc.** | Global Edge Network | **API Edge & Security:** API request routing, edge sliding-window rate limiting, and DDoS mitigation. | Ephemeral transit caching only. Zero persistent storage of personal calendar entries on edge nodes. |
| **Expo (650 Industries)** | United States | **Push Notification Delivery:** Anonymous device push notification tokens and reminder notification headlines. | Tokens used strictly for transient push routing via APNs and FCM. |

---

## 5. Children's Privacy & Age Gate Limitation (DPDP Section 9)

- **Target Audience:** Vanko is built for adult college/university students and working professionals (18+).
- **Self-Declaration Gate:** During registration, all users must affirmatively declare that they are 18 years of age or older or an enrolled college student.
- **Statutory Limitation Notice:** A self-declaration checkbox does not constitute verifiable parental consent under Section 9 of the DPDP Act 2023. Vanko does not knowingly collect personal data from children under 18 years of age or track child behaviors.
- **Expedited Parental Removal:** If a parent or legal guardian discovers that a minor has registered without consent, they may contact our Grievance Officer at [grievance@eventpulse.app](mailto:grievance@eventpulse.app) with the minor's email. We will verify and permanently purge the account and all associated data within **24 hours**.

---

## 6. Data Principal Statutory Rights (DPDP Chapter III)

As a Data Principal under India's DPDP Act 2023, you enjoy full control over your personal data:

1. **Right to Access & Portability (Section 11):**
   - Access your data summary at any time under *Settings > My Data & Privacy Rights*.
   - Export your complete profile, calendar entries, feedback history, and consent records in structured, machine-readable format (**JSON** and **iCalendar RFC 5545**).
2. **Right to Correction & Completion (Section 12):**
   - Correct or update your display name directly from the *My Data* modal.
3. **Right to Withdraw Consent (Section 6(4)):**
   - You have the right to withdraw consent as easily as giving it via *Settings > Manage Data Consents*.
   - **Optional Consents:** You may toggle push notifications on or off at any time without affecting your schedule.
   - **Essential Service Consent:** Because Vanko's sole function is storing and synchronizing your personal schedule, withdrawing consent for core calendar processing requires closing your account and permanently erasing your personal data.
4. **Right to Erasure / Account Deletion (Section 12):**
   - **In-App:** Tap *Settings > Delete My Account & Data*. After entering your credentials (recent re-authentication within 5 minutes), your account, calendar events, push tokens, and profile are immediately hard-deleted.
   - **Web Deletion Portal:** If you have uninstalled the application, you can submit an erasure request via our public [Web Deletion Portal](https://vanko-api.vanko-app.workers.dev/delete-account). The portal uses an anti-enumeration 2-step OTP email verification flow to securely confirm identity before initiating erasure.

---

## 7. Data Retention & Erasure Ledger

- **Active Accounts:** Calendar events and profile data are retained until you manually delete individual items or request complete account erasure.
- **Post-Erasure Audit Retention:** Pursuant to compliance and dispute resolution under DPDP Section 12, a strictly minimized, non-identifying audit record (`anonymizedUidHash`, timestamps, deletion state) is retained in `/accountDeletionAudit` for exactly **90 days**, after which it is automatically expunged via our automated edge TTL maintenance routine.

---

## 8. Grievance Redressal Mechanism
 
If you have questions, feedback, or complaints regarding the processing of your personal data, you may contact our designated Grievance Desk:

- **Department:** Vanko Privacy & Data Protection Office
- **Official Grievance Email:** [privacy@vanko.app](mailto:privacy@vanko.app)
- **In-App Submission:** Settings > Send Feedback / Suggestion
- **Compliance Standards:** Digital Personal Data Protection Act, 2023

If you are unsatisfied with the resolution provided by our Grievance Desk, you have the right under Section 13 of the DPDP Act 2023 to register a complaint with the **Data Protection Board of India (DPBI)**.

---

*This policy was prepared in compliance with the Digital Personal Data Protection Act, 2023, the DPDP Rules 2025, and Google Play Store User Data policies. Prior to commercial submission, consult qualified legal counsel.*
