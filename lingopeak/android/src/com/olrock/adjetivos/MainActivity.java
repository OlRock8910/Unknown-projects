package com.olrock.adjetivos;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Lingo Peak: hosts the app (plain HTML/JS in assets/) in a full-screen
 * WebView and lends it what a WebView lacks — text-to-speech in five
 * languages, vibration, the share sheet and the home-screen widget.
 *
 * Speech goes through Google's engine when the phone has it (the same voices
 * as Google Translate) and falls back to the phone's default engine.
 */
public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int LIGHT = Color.rgb(247, 245, 240);
    private static final int DARK = Color.rgb(18, 20, 28);
    private static final String GOOGLE_TTS = "com.google.android.tts";
    private static final String[][] LOCALES = { {"en", "GB"}, {"es", "ES"}, {"fr", "FR"}, {"de", "DE"}, {"pt", "BR"} };

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady;
    private volatile boolean ttsFailed;
    // The best installed offline voice for each language (null when there isn't one).
    private final Map<String, Voice> voices = new HashMap<String, Voice>();
    private final Map<String, Boolean> hasLang = new HashMap<String, Boolean>();
    private int utterance;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setBars(false);

        web = new WebView(this);
        web.setBackgroundColor(LIGHT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true; // no text-selection popups in the middle of a lesson
            }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "Native");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);

        tts = new TextToSpeech(this, this, GOOGLE_TTS);
    }

    private void setBars(boolean dark) {
        Window w = getWindow();
        int c = dark ? DARK : LIGHT;
        w.setStatusBarColor(c);
        w.setNavigationBarColor(c);
        if (Build.VERSION.SDK_INT >= 23) {
            int flags = 0;
            if (!dark) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26) flags |= 0x00000010; // SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            w.getDecorView().setSystemUiVisibility(flags);
        }
        if (web != null) web.setBackgroundColor(c);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            ttsFailed = true;
            return;
        }
        findVoices();
        ttsReady = true;
    }

    /** The best offline voice for each language, preferring the main country's accent. */
    private synchronized void findVoices() {
        voices.clear();
        hasLang.clear();
        Set<Voice> all = null;
        try { all = tts.getVoices(); } catch (Exception e) { /* some engines throw */ }
        for (String[] lc : LOCALES) {
            Voice best = null;
            int bestScore = -1;
            if (all != null) {
                for (Voice v : all) {
                    if (!lc[0].equals(v.getLocale().getLanguage()) || v.isNetworkConnectionRequired()) continue;
                    if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    int score = (lc[1].equals(v.getLocale().getCountry()) ? 1000 : 0) + v.getQuality();
                    if (score > bestScore) { best = v; bestScore = score; }
                }
            }
            voices.put(lc[0], best);
            int avail;
            try { avail = tts.isLanguageAvailable(new Locale(lc[0], lc[1])); } catch (Exception e) { avail = -1; }
            hasLang.put(lc[0], best != null || avail >= TextToSpeech.LANG_AVAILABLE);
        }
    }

    private static Locale localeFor(String lang) {
        for (String[] lc : LOCALES) if (lc[0].equals(lang)) return new Locale(lc[0], lc[1]);
        return new Locale(lang);
    }

    /** Speaks in a language; queue=true waits for whatever is already being said. */
    private synchronized void say(String text, float rate, String lang, boolean queue) {
        if (tts == null || !ttsReady) return;
        Voice v = voices.get(lang);
        if (v != null) tts.setVoice(v); else tts.setLanguage(localeFor(lang));
        tts.setSpeechRate(Math.max(0.3f, Math.min(2f, rate)));
        tts.speak(text, queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, null, "lp" + (utterance++));
    }

    private boolean hasGoogleTts() {
        if (tts == null) return false;
        for (TextToSpeech.EngineInfo e : tts.getEngines()) if (GOOGLE_TTS.equals(e.name)) return true;
        return false;
    }

    private void open(Intent i, Intent fallback) {
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            if (fallback != null) {
                try { startActivity(fallback); } catch (ActivityNotFoundException ignored) { }
            }
        }
    }

    /** Exposed to JavaScript as window.Native. */
    private class Bridge {
        /** lang: en, es, fr, de or pt. */
        @JavascriptInterface
        public void speakIn(String text, float rate, String lang, boolean queue) {
            say(text, rate, lang, queue);
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) tts.stop();
        }

        /** "init", "ok", "missing" (no voice for this language) or "error". */
        @JavascriptInterface
        public String ttsState(String lang) {
            if (ttsFailed) return "error";
            if (!ttsReady) return "init";
            Boolean ok = hasLang.get(lang);
            return ok != null && ok ? "ok" : "missing";
        }

        /** Opens the screen that downloads voice data (Google's when available). */
        @JavascriptInterface
        public void installVoice(String lang) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent settings = new Intent("com.android.settings.TTS_SETTINGS");
                    if (hasGoogleTts()) open(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).setPackage(GOOGLE_TTS), settings);
                    else open(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + GOOGLE_TTS)), settings);
                }
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    open(Intent.createChooser(send, "Lingo Peak"), null);
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 400)));
        }

        /** Light or dark status and navigation bars, to match the app's theme. */
        @JavascriptInterface
        public void setBars(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.setBars(dark);
                }
            });
        }

        /** New numbers for the home-screen widget (JSON from the app). */
        @JavascriptInterface
        public void updateWidget(String json) {
            getSharedPreferences(LingoWidget.PREFS, MODE_PRIVATE).edit().putString(LingoWidget.KEY, json).apply();
            AppWidgetManager mgr = AppWidgetManager.getInstance(MainActivity.this);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(MainActivity.this, LingoWidget.class));
            if (ids.length > 0) LingoWidget.draw(MainActivity.this, mgr, ids);
        }
    }

    @Override
    public void onBackPressed() {
        // Let the app close whatever is open first; leave only from the home screen.
        web.evaluateJavascript("(window.appBack && window.appBack()) ? 'y' : 'n'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"\"y\"".equals(value)) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tts != null) tts.stop();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // Coming back from the voice download screen: pick up any new voices.
        if (ttsReady) {
            findVoices();
            web.evaluateJavascript("window.onVoicesChanged && window.onVoicesChanged()", null);
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
