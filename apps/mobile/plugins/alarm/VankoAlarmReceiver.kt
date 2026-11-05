package com.suraj.eventpulse.alarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.suraj.eventpulse.MainActivity

class VankoAlarmReceiver : BroadcastReceiver() {
    companion object {
        const val TAG = "VankoAlarmReceiver"
        const val TIMEOUT_MILLIS = 120_000L // 2 minutes auto-cap
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != VankoAlarmScheduler.ACTION_FIRE_ALARM) return

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "vanko:AlarmReceiverWakeLock"
        )
        wakeLock?.acquire(10_000L) // 10 seconds safety buffer

        @Suppress("DEPRECATION")
        val screenWakeLock = powerManager?.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "vanko:AlarmScreenWakeLock"
        )
        screenWakeLock?.acquire(15_000L)

        try {
            val alarmId = intent.getStringExtra("alarmId") ?: return
            val eventId = intent.getStringExtra("eventId") ?: return
            val title = intent.getStringExtra("title") ?: "Event Deadline"
            val stage = intent.getIntExtra("stage", 1)
            val registrationUrl = intent.getStringExtra("registrationUrl")

            Log.i(TAG, "Firing critical deadline alarm: $alarmId ($title) stage=$stage")

            VankoAlarmScheduler.ensureAlarmChannel(context)
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return

            val notifId = eventId.hashCode()
            val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

            // 1. Content Intent (Tapping the notification opens the event in Vanko)
            val contentIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("eventpulse://event/$eventId")
                putExtra("eventId", eventId)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val contentPendingIntent = PendingIntent.getActivity(context, notifId, contentIntent, pendingFlags)

            // 2. Action: Mark as Submitted (Immediate disarm)
            val submitIntent = Intent(context, VankoAlarmActionReceiver::class.java).apply {
                action = VankoAlarmScheduler.ACTION_MARK_SUBMITTED
                putExtra("eventId", eventId)
                putExtra("alarmId", alarmId)
            }
            val submitPendingIntent = PendingIntent.getBroadcast(context, notifId + 10, submitIntent, pendingFlags)

            // 3. Action: Open Registration Link (Direct Activity Intent, no trampoline)
            val linkPendingIntent = if (!registrationUrl.isNullOrBlank()) {
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(registrationUrl)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                PendingIntent.getActivity(context, notifId + 20, browserIntent, pendingFlags)
            } else {
                contentPendingIntent
            }

            // 4. Action: Snooze 10m
            val snoozeIntent = Intent(context, VankoAlarmActionReceiver::class.java).apply {
                action = VankoAlarmScheduler.ACTION_SNOOZE
                putExtra("eventId", eventId)
                putExtra("alarmId", alarmId)
                putExtra("title", title)
                putExtra("stage", stage)
                putExtra("registrationUrl", registrationUrl)
            }
            val snoozePendingIntent = PendingIntent.getBroadcast(context, notifId + 30, snoozeIntent, pendingFlags)

            // 5. Action: Dismiss
            val dismissIntent = Intent(context, VankoAlarmActionReceiver::class.java).apply {
                action = VankoAlarmScheduler.ACTION_DISMISS
                putExtra("eventId", eventId)
                putExtra("alarmId", alarmId)
            }
            val dismissPendingIntent = PendingIntent.getBroadcast(context, notifId + 40, dismissIntent, pendingFlags)

            // 6. Start hardware alarm sound and rhythmic vibration
            VankoAlarmPlayer.start(context)

            // 7. Full-screen Alarm Activity for Lockscreen Display
            val fullScreenIntent = Intent(context, VankoAlarmActivity::class.java).apply {
                putExtra("eventId", eventId)
                putExtra("alarmId", alarmId)
                putExtra("title", title)
                putExtra("stage", stage)
                putExtra("registrationUrl", registrationUrl)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val fullScreenPendingIntent = PendingIntent.getActivity(
                context,
                notifId + 5,
                fullScreenIntent,
                pendingFlags
            )

            // 8. Build Companion Notification (Ongoing in tray, silent so no audio clash with VankoAlarmPlayer)
            val isEmergency = stage >= 2
            val notifTitle = if (isEmergency) "🚨 FINAL CALL (15m): $title" else "⏰ DEADLINE ALARM: $title"
            val notifBody = if (isEmergency) {
                "Registration closes in 15 minutes! Tap to submit or open form immediately."
            } else {
                "Critical deadline approaching. Make sure your registration or submission is complete!"
            }

            val builder = NotificationCompat.Builder(context, VankoAlarmScheduler.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(notifTitle)
                .setContentText(notifBody)
                .setStyle(NotificationCompat.BigTextStyle().bigText(notifBody))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(contentPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setAutoCancel(false)
                .setOngoing(true)
                .addAction(android.R.drawable.checkbox_on_background, "Mark as Submitted", submitPendingIntent)
                .addAction(android.R.drawable.ic_menu_view, if (!registrationUrl.isNullOrBlank()) "Open Form" else "View Details", linkPendingIntent)
                .addAction(android.R.drawable.ic_menu_recent_history, "Snooze 10m", snoozePendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPendingIntent)

            val notification = builder.build()
            notificationManager.notify(notifId, notification)

            // Direct start activity to force display immediately
            try {
                context.startActivity(fullScreenIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Could not start VankoAlarmActivity directly", e)
            }

            // 9. Schedule 2-Minute Auto-Cap: Stops continuous ringing after 120s if phone is unattended
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (alarmManager != null) {
                val timeoutIntent = Intent(context, VankoAlarmActionReceiver::class.java).apply {
                    action = VankoAlarmScheduler.ACTION_TIMEOUT_ALARM
                    putExtra("eventId", eventId)
                    putExtra("alarmId", alarmId)
                    putExtra("title", title)
                    putExtra("stage", stage)
                    putExtra("registrationUrl", registrationUrl)
                }
                val timeoutPendingIntent = PendingIntent.getBroadcast(context, notifId + 50, timeoutIntent, pendingFlags)
                val timeoutTrigger = System.currentTimeMillis() + TIMEOUT_MILLIS
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeoutTrigger, timeoutPendingIntent)
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, timeoutTrigger, timeoutPendingIntent)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error displaying critical alarm notification", e)
        } finally {
            if (wakeLock?.isHeld == true) {
                wakeLock.release()
            }
        }
    }
}

