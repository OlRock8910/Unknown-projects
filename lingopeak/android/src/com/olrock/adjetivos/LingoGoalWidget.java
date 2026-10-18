package com.olrock.adjetivos;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Calendar;

/**
 * The square widget: this week's minutes, "Hit your 20-minute goal" (or how
 * many minutes are left) and the days left in the week. It turns gold once
 * the goal is reached. Uses the same numbers as LingoWidget.
 */
public class LingoGoalWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        draw(context, mgr, ids);
    }

    /** Redraws every square widget on the home screen. */
    static void drawAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, LingoGoalWidget.class));
        if (ids.length > 0) draw(context, mgr, ids);
    }

    static void draw(Context context, AppWidgetManager mgr, int[] ids) {
        int mins = 0, goal = 20, streak = 0;
        String todo = "Hit your {n}-minute goal", toGo = "{n} min to go", done = "Goal hit!",
            daysLeft = "{n} days left", lastDay = "Last day this week", streakLabel = "week streak";
        try {
            String raw = context.getSharedPreferences(LingoWidget.PREFS, Context.MODE_PRIVATE).getString(LingoWidget.KEY, null);
            if (raw != null) {
                JSONObject o = new JSONObject(raw);
                // A new week starts from zero even if the app hasn't been opened yet.
                mins = LingoWidget.thisWeek().equals(o.optString("weekId", LingoWidget.thisWeek())) ? o.optInt("mins") : 0;
                goal = o.optInt("goal", 20);
                streak = o.optInt("streak");
                JSONObject l = o.optJSONObject("labels");
                if (l != null) {
                    todo = l.optString("goalTodo", todo);
                    toGo = l.optString("goalToGo", toGo);
                    done = l.optString("goalDone", done);
                    daysLeft = l.optString("daysLeft", daysLeft);
                    lastDay = l.optString("lastDay", lastDay);
                    streakLabel = l.optString("streak", streakLabel);
                }
            }
        } catch (Exception e) {
            // Show the empty goal.
        }
        boolean hit = mins >= goal;
        // Days left including today, Monday = 7 ... Sunday = 1.
        int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK); // Sunday = 1
        int left = dow == Calendar.SUNDAY ? 1 : 9 - dow;
        String msg = hit ? done : mins == 0 ? todo.replace("{n}", String.valueOf(goal)) : toGo.replace("{n}", String.valueOf(goal - mins));
        String sub = hit ? streak + " " + streakLabel : left == 1 ? lastDay : daysLeft.replace("{n}", String.valueOf(left));

        Intent open = new Intent(context, MainActivity.class);
        PendingIntent tap = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | 0x04000000 /* FLAG_IMMUTABLE */);
        int ink = 0xFF1B1D2A, white = 0xFFFFFFFF, soft = hit ? 0xCC1B1D2A : 0xCCFFFFFF;
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_goal);
            v.setInt(R.id.g_root, "setBackgroundResource", hit ? R.drawable.widget_goal_bg_done : R.drawable.widget_goal_bg);
            v.setTextViewText(R.id.g_mins, String.valueOf(Math.min(mins, 999)));
            v.setTextViewText(R.id.g_goal, "/" + goal + " min");
            v.setProgressBar(R.id.g_bar, goal, Math.min(mins, goal), false);
            v.setTextViewText(R.id.g_msg, msg);
            v.setTextViewText(R.id.g_sub, sub);
            v.setTextColor(R.id.g_mins, hit ? ink : white);
            v.setTextColor(R.id.g_msg, hit ? ink : white);
            v.setTextColor(R.id.g_goal, soft);
            v.setTextColor(R.id.g_sub, soft);
            v.setTextColor(R.id.g_brand, soft);
            v.setOnClickPendingIntent(R.id.g_root, tap);
            mgr.updateAppWidget(id, v);
        }
    }
}
