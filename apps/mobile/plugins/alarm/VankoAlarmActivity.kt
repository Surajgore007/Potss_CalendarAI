package com.suraj.eventpulse.alarm

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class VankoAlarmActivity : AppCompatActivity() {

    private var eventId: String = ""
    private var alarmId: String = ""
    private var titleText: String = ""
    private var stage: Int = 1
    private var registrationUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Wake hardware screen and show over Android lock screen
        turnScreenOnAndShowOverLockscreen()

        // 2. Parse intent extras
        eventId = intent.getStringExtra("eventId") ?: ""
        alarmId = intent.getStringExtra("alarmId") ?: ""
        titleText = intent.getStringExtra("title") ?: "Event Deadline"
        stage = intent.getIntExtra("stage", 1)
        registrationUrl = intent.getStringExtra("registrationUrl")

        // 3. Ensure hardware audio & vibration are playing
        VankoAlarmPlayer.start(this)

        // 4. Render premium glassmorphic UI
        val rootView = buildPremiumAlarmLayout()
        setContentView(rootView)
    }

    private fun turnScreenOnAndShowOverLockscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            km?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun buildPremiumAlarmLayout(): View {
        val dp = resources.displayMetrics.density

        val scrollView = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#09090B")) // Deep obsidian matte
            isFillViewport = true
        }

        val mainContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding((20 * dp).toInt(), (40 * dp).toInt(), (20 * dp).toInt(), (32 * dp).toInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        // --- App Micro-Brand Pill ---
        val brandRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor("#18181B"))
                setStroke((1 * dp).toInt(), Color.parseColor("#27272A"))
                cornerRadius = 20 * dp
            }
            background = bg
            setPadding((12 * dp).toInt(), (5 * dp).toInt(), (14 * dp).toInt(), (5 * dp).toInt())
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (28 * dp).toInt()
            }
            layoutParams = lp
        }

        val pulseDot = View(this).apply {
            val dotBg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(if (stage >= 2) Color.parseColor("#EF4444") else Color.parseColor("#F59E0B"))
            }
            background = dotBg
            val lp = LinearLayout.LayoutParams((7 * dp).toInt(), (7 * dp).toInt()).apply {
                marginEnd = (8 * dp).toInt()
            }
            layoutParams = lp
        }
        brandRow.addView(pulseDot)

        val brandText = TextView(this).apply {
            text = if (stage >= 2) "VANKO • FINAL CALL (15M)" else "VANKO • DEADLINE ALARM"
            setTextColor(Color.parseColor("#E4E4E7"))
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.15f
        }
        brandRow.addView(brandText)
        mainContainer.addView(brandRow)

        // --- Live Clock Digits ---
        val timeFormat = SimpleDateFormat("h:mm", Locale.getDefault())
        val amPmFormat = SimpleDateFormat("a", Locale.getDefault())
        val now = Date()

        val clockRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (24 * dp).toInt()
            }
            layoutParams = lp
        }

        val digitsView = TextView(this).apply {
            text = timeFormat.format(now)
            setTextColor(Color.WHITE)
            textSize = 52f
            typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL)
            includeFontPadding = false
        }
        clockRow.addView(digitsView)

        val amPmView = TextView(this).apply {
            text = " " + amPmFormat.format(now).uppercase()
            setTextColor(Color.parseColor("#71717A"))
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            includeFontPadding = false
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (8 * dp).toInt()
            }
            layoutParams = lp
        }
        clockRow.addView(amPmView)
        mainContainer.addView(clockRow)

        // --- Glassmorphic Center Card ---
        val glassCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val cardBg = GradientDrawable().apply {
                setColor(Color.parseColor("#141417")) // Refined dark glass fill
                setStroke((1 * dp).toInt(), Color.parseColor("#27272A")) // Clean subtle border
                cornerRadius = 22 * dp
            }
            background = cardBg
            setPadding((22 * dp).toInt(), (24 * dp).toInt(), (22 * dp).toInt(), (24 * dp).toInt())
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (24 * dp).toInt()
            }
            layoutParams = lp
        }

        // Card Urgency Badge
        val cardTag = TextView(this).apply {
            text = if (stage >= 2) "IMMEDIATE ACTION REQUIRED" else "UPCOMING SUBMISSION"
            setTextColor(if (stage >= 2) Color.parseColor("#EF4444") else Color.parseColor("#A1A1AA"))
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.12f
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (12 * dp).toInt()
            }
            layoutParams = lp
        }
        glassCard.addView(cardTag)

        // Event Title (High contrast, elegant font)
        val titleView = TextView(this).apply {
            text = titleText
            setTextColor(Color.WHITE)
            textSize = 21f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (8 * dp).toInt()
            }
            layoutParams = lp
        }
        glassCard.addView(titleView)

        // Description / Subtitle
        val subtitleView = TextView(this).apply {
            text = if (stage >= 2)
                "The registration or submission portal closes shortly. Submit now to avoid penalty."
            else
                "Critical deadline approaching. Ensure your task or registration is submitted."
            setTextColor(Color.parseColor("#8E8E93"))
            textSize = 13f
            gravity = Gravity.CENTER
            setLineSpacing(4 * dp, 1.0f)
        }
        glassCard.addView(subtitleView)
        mainContainer.addView(glassCard)

        // Spacer to push buttons to bottom
        val spacer = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1.0f
            )
        }
        mainContainer.addView(spacer)

        // --- Action 1: Mark as Submitted (Crisp High-Contrast White Pill) ---
        val btnSubmit = Button(this).apply {
            text = "✓   Mark as Submitted"
            setTextColor(Color.parseColor("#18181B"))
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            isAllCaps = false
            val btnBg = GradientDrawable().apply {
                setColor(Color.WHITE) // High contrast crisp white
                cornerRadius = 16 * dp
            }
            background = btnBg
            elevation = 4 * dp
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (54 * dp).toInt()
            ).apply {
                bottomMargin = (10 * dp).toInt()
            }
            layoutParams = lp
            setOnClickListener {
                handleMarkSubmitted()
            }
        }
        mainContainer.addView(btnSubmit)

        // --- Action 2: Open Registration Form (If URL present) ---
        if (!registrationUrl.isNullOrBlank()) {
            val btnLink = Button(this).apply {
                text = "Open Portal / Form  ↗"
                setTextColor(Color.WHITE)
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                isAllCaps = false
                val btnBg = GradientDrawable().apply {
                    setColor(Color.parseColor("#1E1E24"))
                    setStroke((1 * dp).toInt(), Color.parseColor("#383842"))
                    cornerRadius = 16 * dp
                }
                background = btnBg
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    (48 * dp).toInt()
                ).apply {
                    bottomMargin = (10 * dp).toInt()
                }
                layoutParams = lp
                setOnClickListener {
                    handleOpenForm()
                }
            }
            mainContainer.addView(btnLink)
        }

        // --- Action 3 & 4: Snooze 10m & Dismiss (Refined Dark Glass Row) ---
        val secondaryRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (48 * dp).toInt()
            ).apply {
                bottomMargin = (12 * dp).toInt()
            }
        }

        val btnSnooze = Button(this).apply {
            text = "Snooze (10m)"
            setTextColor(Color.parseColor("#D4D4D8"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            isAllCaps = false
            val btnBg = GradientDrawable().apply {
                setColor(Color.parseColor("#18181B"))
                setStroke((1 * dp).toInt(), Color.parseColor("#27272A"))
                cornerRadius = 14 * dp
            }
            background = btnBg
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1.0f).apply {
                marginEnd = (5 * dp).toInt()
            }
            layoutParams = lp
            setOnClickListener {
                handleSnooze()
            }
        }
        secondaryRow.addView(btnSnooze)

        val btnDismiss = Button(this).apply {
            text = "Dismiss"
            setTextColor(Color.parseColor("#A1A1AA"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            isAllCaps = false
            val btnBg = GradientDrawable().apply {
                setColor(Color.parseColor("#18181B"))
                setStroke((1 * dp).toInt(), Color.parseColor("#27272A"))
                cornerRadius = 14 * dp
            }
            background = btnBg
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1.0f).apply {
                marginStart = (5 * dp).toInt()
            }
            layoutParams = lp
            setOnClickListener {
                handleDismiss()
            }
        }
        secondaryRow.addView(btnDismiss)
        mainContainer.addView(secondaryRow)

        scrollView.addView(mainContainer)
        return scrollView
    }

    private fun cancelAlarmNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val notifId = eventId.hashCode()
        nm?.cancel(notifId)
    }

    private fun handleMarkSubmitted() {
        VankoAlarmPlayer.stop()
        cancelAlarmNotification()
        if (eventId.isNotBlank()) {
            VankoAlarmScheduler.cancelAlarmsForEvent(this, eventId)
            VankoAlarmStore.recordPendingAction(this, "mark_submitted", eventId)
        }
        Toast.makeText(this, "Marked as submitted — deadline secured", Toast.LENGTH_SHORT).show()
        finish()
    }

    private fun handleOpenForm() {
        VankoAlarmPlayer.stop()
        cancelAlarmNotification()
        val url = registrationUrl
        if (!url.isNullOrBlank()) {
            try {
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(browserIntent)
            } catch (e: Exception) {
                Toast.makeText(this, "Could not open browser", Toast.LENGTH_SHORT).show()
            }
        }
        finish()
    }

    private fun handleSnooze() {
        VankoAlarmPlayer.stop()
        cancelAlarmNotification()
        if (eventId.isNotBlank()) {
            val snoozeTrigger = System.currentTimeMillis() + 10 * 60 * 1000L
            val snoozedItem = AlarmItem(
                alarmId = "snooze_${eventId}_${System.currentTimeMillis()}",
                eventId = eventId,
                title = titleText,
                triggerTimeMs = snoozeTrigger,
                targetDeadlineMs = snoozeTrigger,
                stage = stage,
                registrationUrl = registrationUrl
            )
            VankoAlarmScheduler.scheduleAlarm(this, snoozedItem)
            Toast.makeText(this, "Alarm snoozed for 10 minutes", Toast.LENGTH_SHORT).show()
        }
        finish()
    }

    private fun handleDismiss() {
        VankoAlarmPlayer.stop()
        cancelAlarmNotification()
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        VankoAlarmPlayer.stop()
    }
}
