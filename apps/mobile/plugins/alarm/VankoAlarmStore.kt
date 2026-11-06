package com.suraj.eventpulse.alarm

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

data class AlarmItem(
    val alarmId: String,
    val eventId: String,
    val title: String,
    val triggerTimeMs: Long,
    val targetDeadlineMs: Long,
    val stage: Int, // 1 = Stage 1 (e.g. 2h before), 2 = Stage 2 (e.g. 15m before)
    val registrationUrl: String?,
    val userId: String? = null
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("alarmId", alarmId)
            put("eventId", eventId)
            put("title", title)
            put("triggerTimeMs", triggerTimeMs)
            put("targetDeadlineMs", targetDeadlineMs)
            put("stage", stage)
            put("registrationUrl", registrationUrl ?: "")
            put("userId", userId ?: "")
        }
    }

    companion object {
        fun fromJson(json: JSONObject): AlarmItem {
            return AlarmItem(
                alarmId = json.optString("alarmId"),
                eventId = json.optString("eventId"),
                title = json.optString("title", "Event Deadline"),
                triggerTimeMs = json.optLong("triggerTimeMs", 0L),
                targetDeadlineMs = json.optLong("targetDeadlineMs", 0L),
                stage = json.optInt("stage", 1),
                registrationUrl = json.optString("registrationUrl").takeIf { it.isNotBlank() },
                userId = json.optString("userId").takeIf { it.isNotBlank() }
            )
        }
    }
}

object VankoAlarmStore {
    private const val PREFS_NAME = "vanko_critical_alarms_store"
    private const val KEY_ALARMS = "active_alarms"
    private const val KEY_PENDING_ACTIONS = "pending_actions"
    private const val KEY_ACTIVE_USER_ID = "active_user_id"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    @Synchronized
    fun getActiveUserId(context: Context): String? {
        val prefs = getPrefs(context)
        return prefs.getString(KEY_ACTIVE_USER_ID, null)?.takeIf { it.isNotBlank() }
    }

    @Synchronized
    fun setActiveUserId(context: Context, userId: String?) {
        val prefs = getPrefs(context)
        if (userId.isNullOrBlank()) {
            prefs.edit().remove(KEY_ACTIVE_USER_ID).apply()
        } else {
            prefs.edit().putString(KEY_ACTIVE_USER_ID, userId.trim()).apply()
        }
    }

    @Synchronized
    fun removeAlarmsForOtherUsers(context: Context, currentUserId: String): List<AlarmItem> {
        val list = getAllAlarms(context).toMutableList()
        val toRemove = list.filter { it.userId != null && it.userId != currentUserId }
        list.removeAll { it.userId != null && it.userId != currentUserId }
        persistAlarms(context, list)
        return toRemove
    }

    @Synchronized
    fun saveAlarm(context: Context, item: AlarmItem) {
        val list = getAllAlarms(context).toMutableList()
        // Replace existing alarm with same alarmId or append
        list.removeAll { it.alarmId == item.alarmId }
        list.add(item)
        persistAlarms(context, list)
    }

    @Synchronized
    fun removeAlarm(context: Context, alarmId: String) {
        val list = getAllAlarms(context).toMutableList()
        list.removeAll { it.alarmId == alarmId }
        persistAlarms(context, list)
    }

    @Synchronized
    fun removeAlarmsForEvent(context: Context, eventId: String): List<AlarmItem> {
        val list = getAllAlarms(context).toMutableList()
        val removed = list.filter { it.eventId == eventId }
        list.removeAll { it.eventId == eventId }
        persistAlarms(context, list)
        return removed
    }

    @Synchronized
    fun clear(context: Context) {
        getPrefs(context).edit().remove(KEY_ALARMS).apply()
    }

    @Synchronized
    fun getAlarm(context: Context, alarmId: String): AlarmItem? {
        return getAllAlarms(context).firstOrNull { it.alarmId == alarmId }
    }

    @Synchronized
    fun getAllAlarms(context: Context): List<AlarmItem> {
        val prefs = getPrefs(context)
        val raw = prefs.getString(KEY_ALARMS, null) ?: return emptyList()
        val items = mutableListOf<AlarmItem>()
        try {
            val jsonArray = JSONArray(raw)
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                items.add(AlarmItem.fromJson(obj))
            }
        } catch (e: Exception) {
            android.util.Log.e("VankoAlarmStore", "Failed to parse stored alarms", e)
        }
        return items
    }

    private fun persistAlarms(context: Context, list: List<AlarmItem>) {
        val jsonArray = JSONArray()
        for (item in list) {
            jsonArray.put(item.toJson())
        }
        getPrefs(context).edit().putString(KEY_ALARMS, jsonArray.toString()).apply()
    }

    @Synchronized
    fun recordPendingAction(context: Context, action: String, eventId: String) {
        val prefs = getPrefs(context)
        val raw = prefs.getString(KEY_PENDING_ACTIONS, null)
        val arr = try {
            if (raw != null) JSONArray(raw) else JSONArray()
        } catch (e: Exception) {
            JSONArray()
        }

        val actionObj = JSONObject().apply {
            put("action", action)
            put("eventId", eventId)
            put("timestamp", System.currentTimeMillis())
        }
        arr.put(actionObj)
        prefs.edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply()
    }

    @Synchronized
    fun drainPendingActions(context: Context): List<Pair<String, String>> {
        val prefs = getPrefs(context)
        val raw = prefs.getString(KEY_PENDING_ACTIONS, null) ?: return emptyList()
        val results = mutableListOf<Pair<String, String>>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                results.add(Pair(obj.getString("action"), obj.getString("eventId")))
            }
        } catch (e: Exception) {
            android.util.Log.e("VankoAlarmStore", "Failed to parse pending actions", e)
        }
        prefs.edit().remove(KEY_PENDING_ACTIONS).apply()
        return results
    }
}

