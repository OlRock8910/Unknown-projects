package com.olrock.adjetivos;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * The home-screen widget: this week's minutes towards the 20-minute goal,
 * the weekly streak and words learned. The app hands it the numbers (see
 * MainActivity.Bridge.updateWidget); tapping it opens the app.
 */
public class LingoWidget extends AppWidgetProvider {
    static final String PREFS = "widget";
    static final String KEY = "data";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        draw(context, mgr, ids);
    }

    /** This week as 2026-W42, the same as the app's weekId(). */
    static String thisWeek() {
        Calendar c = Calendar.getInstance();
        c.setFirstDayOfWeek(Calendar.MONDAY);
        c.setMinimalDaysInFirstWeek(4);
        int week = c.get(Calendar.WEEK_OF_YEAR);
        int year = c.get(Calendar.YEAR);
        int month = c.get(Calendar.MONTH);
        if (month == Calendar.JANUARY && week > 50) year--;
        if (month == Calendar.DECEMBER && week == 1) year++;
        return String.format(Locale.ROOT, "%d-W%02d", year, week);
    }

    static void draw(Context context, AppWidgetManager mgr, int[] ids) {
        int mins = 0, goal = 20, streak = 0, words = 0;
        String lang = "", weekLabel = "This week", streakLabel = "week streak", wordsLabel = "words", doneLabel = "Goal done!";
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) {
                JSONObject o = new JSONObject(raw);
                // A new week starts from zero even if the app hasn't been opened yet.
                mins = thisWeek().equals(o.optString("weekId", thisWeek())) ? o.optInt("mins") : 0;
                goal = o.optInt("goal", 20);
                streak = o.optInt("streak");
                words = o.optInt("words");
                lang = o.optString("lang");
                JSONObject l = o.optJSONObject("labels");
                if (l != null) {
                    weekLabel = l.optString("week", weekLabel);
                    streakLabel = l.optString("streak", streakLabel);
                    wordsLabel = l.optString("words", wordsLabel);
                    doneLabel = l.optString("done", doneLabel);
                }
            }
        } catch (Exception e) {
            // Show zeros.
        }
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | 0x04000000 /* FLAG_IMMUTABLE */);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget);
            v.setTextViewText(R.id.w_title, lang.isEmpty() ? "Lingo Peak" : "Lingo Peak · " + lang);
            v.setTextViewText(R.id.w_label, mins >= goal ? doneLabel : weekLabel);
            v.setTextViewText(R.id.w_mins, Math.min(mins, 999) + " / " + goal + " min");
            v.setProgressBar(R.id.w_bar, goal, Math.min(mins, goal), false);
            v.setTextViewText(R.id.w_streak, streak + " " + streakLabel);
            v.setTextViewText(R.id.w_words, words + " " + wordsLabel);
            v.setOnClickPendingIntent(R.id.w_root, tap);
            mgr.updateAppWidget(id, v);
        }
    }
}
