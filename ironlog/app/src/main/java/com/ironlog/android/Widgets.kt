package com.ironlog.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.ironlog.R
import com.ironlog.domain.AppData
import com.ironlog.domain.Motivation
import com.ironlog.domain.overview
import com.ironlog.domain.sessionFor
import com.ironlog.domain.workoutsOn
import com.ironlog.ui.DAY_SHORT
import java.time.LocalDateTime

/** Big widget: a motivation quote, today's plan and this week's count. */
class MotivationWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        Widgets.updateAll(context, context.ironLog.store.current)
    }
}

/** Small widget: what to train today (or next), big emoji first. */
class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        Widgets.updateAll(context, context.ironLog.store.current)
    }
}

object Widgets {

    private fun openApp(context: Context, workoutId: String?): PendingIntent {
        val i = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (workoutId != null) putExtra(MainActivity.EXTRA_WORKOUT, workoutId)
        }
        return PendingIntent.getActivity(context, workoutId?.hashCode() ?: 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private data class Plan(val label: String, val title: String, val emoji: String, val workoutId: String?, val done: Boolean)

    private fun plan(data: AppData, now: LocalDateTime): Plan {
        val today = now.toLocalDate()
        val planned = data.workoutsOn(today)
        if (planned.isNotEmpty()) {
            val w = planned.firstOrNull { data.sessionFor(it.id, today) == null } ?: planned.first()
            val done = planned.all { data.sessionFor(it.id, today) != null }
            return Plan(if (done) "DONE TODAY ✅" else "TODAY", w.name, w.emoji, w.id, done)
        }
        for (i in 1..7L) {
            val d = today.plusDays(i)
            data.workoutsOn(d).firstOrNull()?.let { w ->
                return Plan("REST DAY · NEXT ${DAY_SHORT[d.dayOfWeek.value - 1]}", w.name, w.emoji, w.id, false)
            }
        }
        return Plan("IRONLOG", if (data.workouts.isEmpty()) "Plan your week" else "Rest day", if (data.workouts.isEmpty()) "🏋️" else "😴", null, false)
    }

    fun updateAll(context: Context, data: AppData) {
        val manager = AppWidgetManager.getInstance(context) ?: return
        val now = LocalDateTime.now()
        val plan = plan(data, now)
        val ov = data.overview(now.toLocalDate())

        val motivationIds = manager.getAppWidgetIds(ComponentName(context, MotivationWidget::class.java))
        if (motivationIds.isNotEmpty()) {
            val views = RemoteViews(context.packageName, R.layout.widget_motivation).apply {
                setTextViewText(R.id.widget_quote, Motivation.quoteFor(now.toLocalDate(), now.hour / 3))
                setTextViewText(R.id.widget_streak, "🔥 ${ov.thisWeek} this week")
                setTextViewText(
                    R.id.widget_plan,
                    when {
                        plan.workoutId == null -> plan.title
                        plan.label == "TODAY" -> "Today: ${plan.title} ${plan.emoji}".trim()
                        plan.done -> "Done today ✅ ${plan.title} ${plan.emoji}".trim()
                        else -> "Rest day 😴 · Next: ${plan.title} ${plan.emoji}".trim()
                    },
                )
                setOnClickPendingIntent(R.id.widget_root, openApp(context, plan.workoutId))
            }
            manager.updateAppWidget(motivationIds, views)
        }

        val todayIds = manager.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
        if (todayIds.isNotEmpty()) {
            val views = RemoteViews(context.packageName, R.layout.widget_today).apply {
                setTextViewText(R.id.widget_emoji, plan.emoji.ifBlank { "💪" })
                setTextViewText(R.id.widget_label, plan.label)
                setTextViewText(R.id.widget_title, plan.title)
                setTextViewText(R.id.widget_sub, Motivation.shouts[Math.floorMod(now.toLocalDate().toEpochDay() * 3 + now.hour / 4, Motivation.shouts.size.toLong()).toInt()])
                setOnClickPendingIntent(R.id.widget_root, openApp(context, plan.workoutId))
            }
            manager.updateAppWidget(todayIds, views)
        }
    }
}
