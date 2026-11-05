package com.suraj.eventpulse.alarm

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import com.suraj.eventpulse.MainActivity

class VankoAlarmActionReceiver : BroadcastReceiver() {
    companion object {
        const val TAG = "VankoAlarmAction"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val eventId = intent.getStringExtra("eventId") ?: return
        val alarmId = intent.getStringExtra("alarmId") ?: ""
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return

        val notifId = eventId.hashCode()

        // Always stop hardware alarm audio & vibration immediately upon any user action
        VankoAlarmPlayer.stop()

        when (intent.action) {
            VankoAlarmScheduler.ACTION_MARK_SUBMITTED -> {
                Log.i(TAG, "User marked deadline as submitted for event $eventId")
                // 1. Cancel active ringing notification
                notificationManager.cancel(notifId)

                // 2. Disarm all remaining alarms for this event
                VankoAlarmScheduler.cancelAlarmsForEvent(context, eventId)

                // 3. Queue action for React Native JS runtime to sync Firestore
                VankoAlarmStore.recordPendingAction(context, "mark_submitted", eventId)

                // 4. User feedback
                try {
                    Toast.makeText(context, "Marked as submitted — alarms disarmed", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {}
            }

            VankoAlarmScheduler.ACTION_SNOOZE -> {
                Log.i(TAG, "User snoozed alarm for event $eventId")
                notificationManager.cancel(notifId)

                val title = intent.getStringExtra("title") ?: "Event Deadline"
                val stage = intent.getIntExtra("stage", 1)
                val registrationUrl = intent.getStringExtra("registrationUrl")

                // Reschedule for +10 minutes
                val snoozeTime = System.currentTimeMillis() + 10 * 60 * 1000L
                val snoozedItem = AlarmItem(
                    alarmId = "snooze_${eventId}_${System.currentTimeMillis()}",
                    eventId = eventId,
                    title = title,
                    triggerTimeMs = snoozeTime,
                    targetDeadlineMs = snoozeTime,
                    stage = stage,
                    registrationUrl = registrationUrl
                )
                VankoAlarmScheduler.scheduleAlarm(context, snoozedItem)

                try {
                    Toast.makeText(context, "Alarm snoozed for 10 minutes", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {}
            }

            VankoAlarmScheduler.ACTION_DISMISS -> {
                Log.i(TAG, "User dismissed alarm for event $eventId")
                notificationManager.cancel(notifId)
            }

            VankoAlarmScheduler.ACTION_TIMEOUT_ALARM -> {
                Log.i(TAG, "Alarm 2-minute ring duration elapsed for event $eventId. Auto-capping sound.")
                // Re-post notification without FLAG_INSISTENT (silences looping sound, leaves card in tray)
                val title = intent.getStringExtra("title") ?: "Event Deadline"
                val registrationUrl = intent.getStringExtra("registrationUrl")

                val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

                val contentIntent = Intent(context, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    data = Uri.parse("eventpulse://event/$eventId")
                    putExtra("eventId", eventId)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val contentPendingIntent = PendingIntent.getActivity(context, notifId, contentIntent, pendingFlags)

                val submitIntent = Intent(context, VankoAlarmActionReceiver::class.java).apply {
                    action = VankoAlarmScheduler.ACTION_MARK_SUBMITTED
                    putExtra("eventId", eventId)
                    putExtra("alarmId", alarmId)
                }
                val submitPendingIntent = PendingIntent.getBroadcast(context, notifId + 10, submitIntent, pendingFlags)

                val linkPendingIntent = if (!registrationUrl.isNullOrBlank()) {
                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(registrationUrl)).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    PendingIntent.getActivity(context, notifId + 20, browserIntent, pendingFlags)
                } else {
                    contentPendingIntent
                }

                val dismissIntent = Intent(context, VankoAlarmActionReceiver::class.java).apply {
                    action = VankoAlarmScheduler.ACTION_DISMISS
                    putExtra("eventId", eventId)
                    putExtra("alarmId", alarmId)
                }
                val dismissPendingIntent = PendingIntent.getBroadcast(context, notifId + 40, dismissIntent, pendingFlags)

                val quietBuilder = NotificationCompat.Builder(context, VankoAlarmScheduler.CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle("⏰ MISSED ALARM: $title")
                    .setContentText("The deadline alarm has rung. Tap to submit entry or view details.")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_EVENT)
                    .setContentIntent(contentPendingIntent)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setSilent(true) // Stops the audio completely!
                    .addAction(android.R.drawable.checkbox_on_background, "Mark as Submitted", submitPendingIntent)
                    .addAction(android.R.drawable.ic_menu_view, if (!registrationUrl.isNullOrBlank()) "Open Form" else "View Details", linkPendingIntent)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPendingIntent)

                notificationManager.notify(notifId, quietBuilder.build())
            }
        }
    }
}

