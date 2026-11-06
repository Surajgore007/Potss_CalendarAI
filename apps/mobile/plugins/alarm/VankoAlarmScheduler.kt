package com.suraj.eventpulse.alarm

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import com.suraj.eventpulse.MainActivity

object VankoAlarmScheduler {
    const val TAG = "VankoAlarmScheduler"
    const val CHANNEL_ID = "vanko_critical_alarms_v2"
    const val ACTION_FIRE_ALARM = "com.suraj.eventpulse.alarm.ACTION_FIRE_ALARM"
    const val ACTION_TIMEOUT_ALARM = "com.suraj.eventpulse.alarm.ACTION_TIMEOUT_ALARM"
    const val ACTION_MARK_SUBMITTED = "com.suraj.eventpulse.alarm.ACTION_MARK_SUBMITTED"
    const val ACTION_SNOOZE = "com.suraj.eventpulse.alarm.ACTION_SNOOZE"
    const val ACTION_DISMISS = "com.suraj.eventpulse.alarm.ACTION_DISMISS"

    fun ensureAlarmChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return

            val existing = notificationManager.getNotificationChannel(CHANNEL_ID)
            if (existing != null) return

            val alarmSound: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                "Critical Deadline Alarms",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High-priority alarms for important deadlines and registration cutoffs."
                setSound(alarmSound, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 1000)
                enableLights(true)
                lightColor = android.graphics.Color.RED
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setBypassDnd(true)
                }
            }

            notificationManager.createNotificationChannel(channel)
            Log.i(TAG, "Created notification channel $CHANNEL_ID with USAGE_ALARM")
        }
    }

    fun scheduleAlarm(
        context: Context,
        item: AlarmItem
    ): Boolean {
        ensureAlarmChannel(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false

        // Check exact alarm permission on Android 12+ (API 31+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!alarmManager.canScheduleExactAlarms()) {
                Log.w(TAG, "Cannot schedule exact alarm: exact alarm permission not granted by user")
                return false
            }
        }

        val now = System.currentTimeMillis()
        if (item.triggerTimeMs <= now) {
            Log.w(TAG, "Cannot schedule alarm in the past: trigger=${item.triggerTimeMs}, now=$now")
            return false
        }

        try {
            // 1. Intent fired when alarm clock triggers
            val alarmIntent = Intent(context, VankoAlarmReceiver::class.java).apply {
                action = ACTION_FIRE_ALARM
                putExtra("alarmId", item.alarmId)
                putExtra("eventId", item.eventId)
                putExtra("title", item.title)
                putExtra("stage", item.stage)
                putExtra("targetDeadlineMs", item.targetDeadlineMs)
                putExtra("registrationUrl", item.registrationUrl)
                putExtra("userId", item.userId)
            }

            val requestCode = item.alarmId.hashCode()
            val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val operationPendingIntent = PendingIntent.getBroadcast(context, requestCode, alarmIntent, pendingFlags)

            // 2. ShowIntent for the AlarmClockInfo (tapping status bar clock or lockscreen clock)
            val showIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("eventpulse://event/${item.eventId}")
                putExtra("eventId", item.eventId)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val showPendingIntent = PendingIntent.getActivity(context, requestCode + 1, showIntent, pendingFlags)

            // 3. Register setAlarmClock() for zero-drift Doze exemption & system clock icon
            val alarmClockInfo = AlarmManager.AlarmClockInfo(item.triggerTimeMs, showPendingIntent)
            alarmManager.setAlarmClock(alarmClockInfo, operationPendingIntent)

            // 4. Save to persistent native store
            VankoAlarmStore.saveAlarm(context, item)
            Log.i(TAG, "Successfully scheduled alarm clock for event ${item.eventId} (${item.title}) at ${item.triggerTimeMs}")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule alarm via AlarmManager", e)
            return false
        }
    }

    fun cancelAlarm(context: Context, alarmId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val alarmIntent = Intent(context, VankoAlarmReceiver::class.java).apply {
            action = ACTION_FIRE_ALARM
        }
        val requestCode = alarmId.hashCode()
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val pendingIntent = PendingIntent.getBroadcast(context, requestCode, alarmIntent, pendingFlags)
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()

        VankoAlarmStore.removeAlarm(context, alarmId)
        Log.i(TAG, "Cancelled alarm $alarmId")
    }

    fun cancelAlarmsForEvent(context: Context, eventId: String) {
        val removed = VankoAlarmStore.removeAlarmsForEvent(context, eventId)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        for (item in removed) {
            val alarmIntent = Intent(context, VankoAlarmReceiver::class.java).apply {
                action = ACTION_FIRE_ALARM
            }
            val requestCode = item.alarmId.hashCode()
            val pendingIntent = PendingIntent.getBroadcast(context, requestCode, alarmIntent, pendingFlags)
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
        }
        Log.i(TAG, "Cancelled ${removed.size} alarms for event $eventId")
    }

    fun cancelAllAlarms(context: Context) {
        val all = VankoAlarmStore.getAllAlarms(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        for (item in all) {
            val alarmIntent = Intent(context, VankoAlarmReceiver::class.java).apply {
                action = ACTION_FIRE_ALARM
            }
            val requestCode = item.alarmId.hashCode()
            val pendingIntent = PendingIntent.getBroadcast(context, requestCode, alarmIntent, pendingFlags)
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
        }
        VankoAlarmStore.clear(context)
        Log.i(TAG, "Cancelled all critical alarms (${all.size} total)")
    }

    fun cancelAlarmsForOtherUsers(context: Context, currentUserId: String) {
        val removed = VankoAlarmStore.removeAlarmsForOtherUsers(context, currentUserId)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        for (item in removed) {
            val alarmIntent = Intent(context, VankoAlarmReceiver::class.java).apply {
                action = ACTION_FIRE_ALARM
            }
            val requestCode = item.alarmId.hashCode()
            val pendingIntent = PendingIntent.getBroadcast(context, requestCode, alarmIntent, pendingFlags)
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
        }
        if (removed.isNotEmpty()) {
            Log.i(TAG, "Cancelled ${removed.size} stale alarms belonging to other users")
        }
    }
}

