package com.suraj.eventpulse.alarm

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class VankoBootReceiver : BroadcastReceiver() {
    companion object {
        const val TAG = "VankoBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received system broadcast: $action. Re-synchronizing active critical alarms.")

        val validActions = listOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_REBOOT,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON"
        )

        val isExactAlarmPermChange = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            action == AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
        } else false

        if (!validActions.contains(action) && !isExactAlarmPermChange) return

        val activeUserId = VankoAlarmStore.getActiveUserId(context)
        if (activeUserId.isNullOrBlank()) {
            Log.i(TAG, "Device booted with no logged-in user. Suppressing alarm re-scheduling.")
            return
        }

        VankoAlarmScheduler.ensureAlarmChannel(context)
        val allAlarms = VankoAlarmStore.getAllAlarms(context)
        val now = System.currentTimeMillis()
        var rescheduledCount = 0

        for (item in allAlarms) {
            // Disarm any alarms belonging to a different user account
            if (item.userId != null && item.userId != activeUserId) {
                VankoAlarmScheduler.cancelAlarm(context, item.alarmId)
                continue
            }

            if (item.triggerTimeMs > now) {
                // Standard case: Alarm trigger is still in future
                val success = VankoAlarmScheduler.scheduleAlarm(context, item)
                if (success) rescheduledCount++
            } else if (item.targetDeadlineMs > now + 60_000L) {
                // Short-notice recovery: Trigger passed while device was powered off, but deadline is still in future!
                // Fire alarm immediately in 15 seconds so student doesn't miss it
                Log.w(TAG, "Alarm trigger passed during shutdown for event ${item.eventId}, but deadline is still active. Scheduling immediate recovery alarm.")
                val immediateItem = item.copy(triggerTimeMs = now + 15_000L)
                val success = VankoAlarmScheduler.scheduleAlarm(context, immediateItem)
                if (success) rescheduledCount++
            } else {
                // Deadline is fully in past: clean up
                VankoAlarmStore.removeAlarm(context, item.alarmId)
            }
        }

        Log.i(TAG, "Re-armed $rescheduledCount critical alarms out of ${allAlarms.size} stored entries.")
    }
}

