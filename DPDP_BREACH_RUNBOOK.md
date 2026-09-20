# Personal Data Breach Response Runbook (DPDP Rules 2025 Aligned)

**Statutory Authority:** Rule 7, Digital Personal Data Protection Rules, 2025 & Section 8(6), DPDP Act 2023  
**Application:** Vanko (EventPulse) — `com.suraj.eventpulse`  
**Data Fiduciary:** Vanko Data Governance & Privacy Office (`supportvanko@gmail.com`)  
**Effective Date:** September 13, 2026  

---

## 1. Statutory Breach Notification Timeline (Rule 7, DPDP Rules 2025)

Under Rule 7 of the DPDP Rules 2025, any personal data breach triggering a risk of harm to Data Principals requires a **two-phase statutory reporting sequence**:

```
[Breach Confirmed]
       |
       |---> Phase 1: Immediate First Notice ("Without Delay")
       |     - To: Data Protection Board of India (DPBI) & Affected Users
       |     - Content: Incident summary, affected categories, immediate containment advice
       |
       |---> Phase 2: Comprehensive Technical Report (Within 72 Hours)
             - To: Data Protection Board of India (DPBI)
             - Content: Root cause analysis, forensic audit, final scope, corrective safeguards
```

---

## 2. Five-Stage Incident Response Procedure

### Stage 1: Identification & Escalation (Hours 0–2)
1. **Trigger Alert:** Detection of unauthorized access, database leakage, compromised service account credentials, or unusual API exfiltration patterns.
2. **Escalate to Data Fiduciary:** Notify Vanko Security & Incident Lead (`supportvanko@gmail.com`) immediately.
3. **Open Incident Log:** Record initial discovery timestamp, reporter details, and suspected systems involved.

### Stage 2: Immediate Containment & Isolation (Hours 2–6)
1. **Rotate Credentials:** Immediately rotate Firebase Service Account private keys via Google Cloud Console and update Cloudflare Worker secrets via `wrangler secret put FIREBASE_PRIVATE_KEY`.
2. **Revoke Active Sessions:** Invalidate Firebase Auth refresh tokens across compromised scopes via Identity Toolkit.
3. **Block Adversarial IPs:** Add malicious IP blocks at the Cloudflare WAF edge.
4. **Deploy Lockdown Firestore Rules:** If database leakage is identified, immediately deploy rules restricting all client operations to safe modes.

### Stage 3: Phase 1 Notification — "Without Delay" (Hours 6–12)
Pursuant to DPDP Rule 7(1), submit initial notice to the **Data Protection Board of India (DPBI)** and email affected users:
- Nature and suspected timing of the incident.
- Categories of personal data involved (e.g., email addresses, calendar entries).
- Immediate containment actions taken.
- Recommended protective measures for affected users (e.g., password resets).
- Dedicated point of contact: `supportvanko@gmail.com`.

### Stage 4: Forensic Investigation & Remediation (Hours 12–48)
1. **Audit Log Inspection:** Review Cloudflare Worker access logs and Google Cloud audit logs.
2. **Exfiltration Scoping:** Determine exact UIDs, email addresses, and event documents accessed.
3. **Vulnerability Patching:** Fix underlying security flaw in codebase, dependencies, or IAM configuration.
4. **Independent Verification:** Perform type-check, automated security tests, and regression verification.

### Stage 5: Phase 2 Detailed Report — Within 72 Hours (Hours 48–72)
Pursuant to DPDP Rule 7(2), submit the final detailed report to the DPBI:
- Comprehensive root cause analysis.
- Exact number of affected Data Principals and geographic breakdown.
- Impact assessment on Data Principals (identity risk, financial risk, harassment risk).
- Architectural and procedural safeguards implemented to prevent recurrence.
- Transcript of all communications issued to affected users.

---

## 3. Statutory Communication Templates

### Template A: Immediate Notice to Affected Users (Email / In-App)
```
Subject: [Urgent Notice] Important Security Information Regarding Your Vanko Account

Dear Vanko User,

We are writing to inform you of a data security incident that may have affected your personal data in our application (Vanko / EventPulse).

What Happened:
On [Date] at [Time IST], our monitoring detected unauthorized access to [describe system: e.g. a database backup containing account email addresses and saved calendar titles].

What Data Was Involved:
The affected data may have included your registered email address and calendar event titles. Your account passwords are stored using salted cryptographic hashes on Google Firebase and were NOT exposed in plain text.

What We Have Done:
We immediately contained the incident by rotating all service credentials, blocking unauthorized access points, and notifying the Data Protection Board of India pursuant to Rule 7 of the DPDP Rules 2025.

What You Should Do:
1. As a precautionary measure, please update your account password.
2. Be vigilant against suspicious or phishing emails purporting to be from campus organizations or event organizers.

For inquiries or assistance, please contact our Privacy & Security Desk directly at supportvanko@gmail.com. We take the privacy of your data with utmost seriousness and deeply regret this incident.
 
Sincerely,
Vanko Data Protection & Security Team
Vanko Privacy Office
```

---

## 4. Post-Incident Review & Record Keeping
- All incident documentation, forensic logs, and correspondence must be archived in an encrypted offline storage for a minimum of **5 years** for regulatory accountability.
