# Google Play Store Production Listing & Submission Guide

This document contains the official store listing metadata, exact alarm permission declaration, and personal developer account 14-day closed testing playbook for **Vanko** (`com.suraj.eventpulse`).

---

## 1. Store Listing Metadata

### App Title (30 characters max)
```
Vanko: Smart College Calendar
```
*(Exact character count: 29 / 30)*

### Short Description (80 characters max)
```
Track college hackathons, deadlines & schedules with instant AI extraction.
```
*(Exact character count: 74 / 80)*

### Full Description (4,000 characters max)
```markdown
Never miss a college hackathon, assignment deadline, or campus event again. Vanko is the ultimate AI-powered calendar and schedule manager designed specifically for university students, tech communities, and campus builders.

✨ INSTANT AI EVENT EXTRACTION
Copy and share announcement text, circulars, or WhatsApp group messages directly into Vanko. Our smart parser instantly extracts event dates, registration deadlines, competition modes (online, offline, hybrid), and registration links into your personal calendar in seconds.

⏰ RELIABLE OFFLINE REMINDERS & DEADLINE ALERTS
Vanko works 100% offline. All your schedules, deadlines, and events are stored securely on your device. High-priority, deterministic local alerts notify you 24 hours, 12 hours, and 2 hours before registration closes or events kick off—even when your phone is in Airplane mode or offline.

🛡️ PRIVACY-FIRST & ZERO TRACKING
Built in full compliance with modern data protection standards:
• No third-party ad trackers or telemetry SDKs.
• Zero data selling or broker sharing.
• Complete transparency: export your full account data or initiate a one-tap permanent deletion anytime.

📅 SMART TIMELINE & CLASH DETECTION
• Interactive visual timeline and monthly calendar views.
• Automated collision detection alerts you when competitions or exams overlap.
• Instant search and tag filtering for hackathons, CTFs, workshops, and meetups.

🏫 CAMPUS INTEGRATION
Stay updated with official community digests and college announcements with built-in push notification channels.

Download Vanko today and take complete control of your college schedule!
```

### Categorization & Contact Details
- **Application Type**: App
- **Primary Category**: Education
- **Secondary Category**: Productivity
- **Tags**: `Calendar`, `Events`, `Productivity`, `College`, `Hackathons`
- **Content Rating**: Everyone (PEGI 3 / ESRB Everyone)
- **Support Email**: supportvanko@gmail.com
- **Privacy Policy URL**: `https://yourdomain.com/privacy-policy` *(Content from `PRIVACY_POLICY.md`)*

---

## 2. Store Graphic Assets

The high-resolution store listing graphic assets have been generated and placed in `apps/mobile/assets/store_listing/`:

| Asset Type | Resolution | File Location | Status |
| :--- | :--- | :--- | :--- |
| **Feature Graphic** | 1024 x 500 px (16:9 / 2:1) | `apps/mobile/assets/store_listing/feature_graphic_1024x500.jpg` | ✅ Generated & Stored |
| **High-Res App Icon** | 512 x 512 px (1:1) | `apps/mobile/assets/store_listing/app_icon_512x512.jpg` | ✅ Generated & Stored |

> [!TIP]
> When uploading `app_icon_512x512.jpg` to the Google Play Console, upload the square image with full bleed. Google Play will automatically apply its standard adaptive squircle mask and drop shadow.

---

## 3. Google Play Exact Alarm Permission Declaration

In the Google Play Console, under **App Content** ➔ **Exact Alarm Permission (`SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`)**:

### Selected Use Case Category
Select: **Calendar, reminder, or alarm clock app**

### Declaration & Reviewer Rationale
Paste the following statement into the justification field:

```
Vanko is an offline-first college calendar, schedule management, and deadline reminder application. The core user-facing functionality of the app is scheduling and delivering timely, deterministic alarm notifications for user-saved academic schedules, hackathon registration deadlines, and event start times (configured at 24 hours, 12 hours, and 2 hours prior to start/deadline).

Exact alarm permissions (SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM) are required because inexact background jobs (such as WorkManager or AlarmManager.setWindow) cannot guarantee timely delivery for hard academic and competition deadlines where a 15-minute delay causes students to forfeit registration. Exact alarms are scheduled strictly in response to user-initiated event additions and local calendar dates, and function entirely on-device even when the device is in doze mode or completely offline.
```

---

## 4. Personal Developer Account: 14-Day Closed Testing Playbook

For personal developer accounts created after November 13, 2023, Google Play requires a mandatory **14-day closed testing phase** before you can apply for Production access.

### Step-by-Step Execution Plan

#### Step 1: Set Up Closed Testing Track
1. Navigate to **Play Console** ➔ **Testing** ➔ **Closed testing**.
2. Click **Create track** (e.g., name it `Alpha Testers`).
3. Under **Testers**, create an email list or link a Google Group:
   - Recuit at least **12 to 20 testers** (friends, classmates, college peers).
   - Add their Google Play account email addresses to the list.
4. Save the track settings.

#### Step 2: Upload Your Production AAB Bundle
1. Build your production Android App Bundle:
   ```bash
   eas build --platform android --profile production
   ```
   *(Or generate locally: `cd apps/mobile/android && ./gradlew bundleRelease`)*
2. In your Closed Testing track, click **Create new release**, upload your `.aab` file, and roll out the release.

#### Step 3: Distribute Opt-In Links
1. Copy the **Join on Android** and **Join on the web** opt-in URLs from the Closed Testing tab.
2. Share the opt-in link with all your designated testers.
3. **CRITICAL REQUIREMENT**: Ensure all testers click **Accept Invite** / **Become a Tester** and install the app on their Android devices.

#### Step 4: The 14-Day Continuous Window
- The testers must stay opted in for **14 consecutive days**.
- Encourage testers to open the app, add events, test AI extraction, and verify reminder alarms.
- Gather feedback and push minor updates if needed (updating your closed release does not reset the 14-day counter).

#### Step 5: Apply for Production Access
Once the 14-day countdown finishes in the Play Console:
1. Click **Apply for production**.
2. Google Play will prompt you with a short questionnaire:
   - **How did you recruit testers?** (e.g., *"Recruited students and campus developers from our college tech community."*)
   - **How was the app tested?** (e.g., *"Testers actively tested calendar sync, AI event extraction from campus circulars, local offline deadline notifications, and account privacy features across multiple Android devices and versions."*)
   - **What feedback did you receive and what changes were made?** (e.g., *"Testers highlighted the need for offline persistence and stable event editing; we resolved startup race conditions, added local AlarmManager guards, and enhanced cross-user cache isolation."*)
3. Submit the application. Google typically approves production access within 2 to 7 days.
