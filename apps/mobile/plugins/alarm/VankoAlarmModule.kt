package com.suraj.eventpulse.alarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.*

class VankoAlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "VankoAlarmModule"

    @ReactMethod
    fun scheduleAlarm(
        alarmId: String,
        eventId: String,
        title: String,
        triggerTimeMs: Double,
        targetDeadlineMs: Double,
        stage: Int,
        registrationUrl: String?,
        userId: String?,
        promise: Promise
    ) {
        try {
            val item = AlarmItem(
                alarmId = alarmId,
                eventId = eventId,
                title = title,
                triggerTimeMs = triggerTimeMs.toLong(),
                targetDeadlineMs = targetDeadlineMs.toLong(),
                stage = stage,
                registrationUrl = registrationUrl,
                userId = userId
            )
            val success = VankoAlarmScheduler.scheduleAlarm(reactContext, item)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ALARM_SCHEDULE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setActiveUser(userId: String?, promise: Promise) {
        try {
            val previousUid = VankoAlarmStore.getActiveUserId(reactContext)
            if (userId.isNullOrBlank()) {
                // User signed out: cancel all alarms and drop stored active user
                VankoAlarmScheduler.cancelAllAlarms(reactContext)
                VankoAlarmStore.setActiveUserId(reactContext, null)
            } else {
                if (!previousUid.isNullOrBlank() && previousUid != userId) {
                    // Switched account: cancel all alarms from previous account
                    VankoAlarmScheduler.cancelAllAlarms(reactContext)
                }
                VankoAlarmStore.setActiveUserId(reactContext, userId)
                // Purge any stale alarms belonging to another user
                VankoAlarmScheduler.cancelAlarmsForOtherUsers(reactContext, userId)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_ACTIVE_USER_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAlarm(alarmId: String, promise: Promise) {
        try {
            VankoAlarmScheduler.cancelAlarm(reactContext, alarmId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAlarmsForEvent(eventId: String, promise: Promise) {
        try {
            VankoAlarmScheduler.cancelAlarmsForEvent(reactContext, eventId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAllAlarms(promise: Promise) {
        try {
            VankoAlarmScheduler.cancelAllAlarms(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_CANCEL_ALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                val can = alarmManager?.canScheduleExactAlarms() ?: false
                promise.resolve(can)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
                val isIgnoring = powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: true
                promise.resolve(isIgnoring)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getAlarmVolume(promise: Promise) {
        try {
            val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            if (audioManager != null) {
                val current = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
                val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
                val map = Arguments.createMap().apply {
                    putInt("volume", current)
                    putInt("maxVolume", max)
                    putBoolean("isMuted", current == 0)
                }
                promise.resolve(map)
            } else {
                val map = Arguments.createMap().apply {
                    putInt("volume", 5)
                    putInt("maxVolume", 7)
                    putBoolean("isMuted", false)
                }
                promise.resolve(map)
            }
        } catch (e: Exception) {
            promise.reject("AUDIO_VOLUME_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openBatteryOptimizationSettings() {
        try {
            // Play Store safe: open system battery optimization list screen
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to general application settings
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:" + reactContext.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (err: Exception) {}
        }
    }

    @ReactMethod
    fun openExactAlarmSettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:" + reactContext.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            }
        } catch (e: Exception) {
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:" + reactContext.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (err: Exception) {}
        }
    }

    @ReactMethod
    fun openAlarmChannelSettings() {
        try {
            VankoAlarmScheduler.ensureAlarmChannel(reactContext)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
                    putExtra(Settings.EXTRA_CHANNEL_ID, VankoAlarmScheduler.CHANNEL_ID)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            }
        } catch (e: Exception) {
            try {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            } catch (err: Exception) {}
        }
    }

    @ReactMethod
    fun drainPendingActions(promise: Promise) {
        try {
            val actions = VankoAlarmStore.drainPendingActions(reactContext)
            val array = Arguments.createArray()
            for (item in actions) {
                val map = Arguments.createMap().apply {
                    putString("action", item.first)
                    putString("eventId", item.second)
                }
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("DRAIN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getScheduledAlarms(promise: Promise) {
        try {
            val alarms = VankoAlarmStore.getAllAlarms(reactContext)
            val array = Arguments.createArray()
            for (a in alarms) {
                val map = Arguments.createMap().apply {
                    putString("alarmId", a.alarmId)
                    putString("eventId", a.eventId)
                    putString("title", a.title)
                    putDouble("triggerTimeMs", a.triggerTimeMs.toDouble())
                    putDouble("targetDeadlineMs", a.targetDeadlineMs.toDouble())
                    putInt("stage", a.stage)
                    putString("registrationUrl", a.registrationUrl ?: "")
                }
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("GET_ALARMS_ERROR", e.message, e)
        }
    }
}

