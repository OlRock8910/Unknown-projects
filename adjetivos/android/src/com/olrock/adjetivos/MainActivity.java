package com.olrock.adjetivos;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Hosts the game (plain HTML/JS in assets/) in a full-screen WebView and
 * lends it the two things a WebView lacks: Spanish text-to-speech and
 * vibration. Everything runs offline.
 *
 * Speech goes through Google's engine when the phone has it — the same
 * voices as Google Translate — and falls back to the phone's default engine.
 */
public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int BG = Color.rgb(11, 11, 30);
    private static final String GOOGLE_TTS = "com.google.android.tts";

    private WebView web;
    private TextToSpeech tts;
    // "init" until the engine answers, then "ok", "missing" (no Spanish voice) or "error".
    private volatile String ttsState = "init";
    // Spanish voices that work offline, best first.
    private volatile List<Voice> voices = new ArrayList<Voice>();
    private volatile String wantedVoice = "";
    private volatile String currentVoice = "";
    // Voices for each language, so English instructions and Spanish words can share one queue.
    private volatile Voice esVoice;
    private volatile Voice enVoice;
    private volatile boolean enReady;
    private int utterance;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true; // no text-selection popups in the middle of a game
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

        // Asking for Google's engine falls back to the default one if it isn't installed.
        tts = new TextToSpeech(this, this, GOOGLE_TTS);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            ttsState = "error";
            return;
        }
        applyVoice();
    }

    /** Re-reads the installed Spanish voices and switches to the wanted (or best) one. */
    private synchronized void applyVoice() {
        if (tts == null) return;
        List<Voice> found = new ArrayList<Voice>();
        try {
            Set<Voice> all = tts.getVoices();
            if (all != null) {
                for (Voice v : all) {
                    if (!"es".equals(v.getLocale().getLanguage())) continue;
                    if (v.isNetworkConnectionRequired()) continue; // the app has no internet permission
                    if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    found.add(v);
                }
            }
        } catch (Exception e) {
            // Some engines throw here; fall through to setLanguage.
        }
        Collections.sort(found, new Comparator<Voice>() {
            @Override
            public int compare(Voice a, Voice b) {
                int spainA = "ES".equals(a.getLocale().getCountry()) ? 0 : 1;
                int spainB = "ES".equals(b.getLocale().getCountry()) ? 0 : 1;
                if (spainA != spainB) return spainA - spainB;
                if (a.getQuality() != b.getQuality()) return b.getQuality() - a.getQuality();
                return a.getName().compareTo(b.getName());
            }
        });
        voices = found;

        enVoice = pickEnglish();
        enReady = enVoice != null || tts.isLanguageAvailable(Locale.US) >= 0;

        Voice pick = null;
        for (Voice v : found) if (v.getName().equals(wantedVoice)) pick = v;
        if (pick == null && !found.isEmpty()) pick = found.get(0);
        if (pick != null && tts.setVoice(pick) == TextToSpeech.SUCCESS) {
            esVoice = pick;
            currentVoice = pick.getName();
            ttsState = "ok";
            return;
        }
        esVoice = null;
        int r = tts.setLanguage(new Locale("es", "ES"));
        if (r < 0) r = tts.setLanguage(new Locale("es"));
        currentVoice = "";
        ttsState = r < 0 ? "missing" : "ok";
    }

    /** Best offline English voice, preferring the phone's own English accent. */
    private Voice pickEnglish() {
        String country = "en".equals(Locale.getDefault().getLanguage()) ? Locale.getDefault().getCountry() : "US";
        Voice best = null;
        int bestScore = -1;
        try {
            Set<Voice> all = tts.getVoices();
            if (all == null) return null;
            for (Voice v : all) {
                if (!"en".equals(v.getLocale().getLanguage()) || v.isNetworkConnectionRequired()) continue;
                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                int score = (country.equals(v.getLocale().getCountry()) ? 1000 : 0) + v.getQuality();
                if (score > bestScore) { best = v; bestScore = score; }
            }
        } catch (Exception e) {
            return null;
        }
        return best;
    }

    /** Switches language and speaks; queue=true waits for whatever is already being said. */
    private synchronized void say(String text, float rate, String lang, boolean queue) {
        if (tts == null || "init".equals(ttsState) || "error".equals(ttsState)) return;
        if ("en".equals(lang)) {
            if (!enReady) return;
            if (enVoice != null) tts.setVoice(enVoice); else tts.setLanguage(Locale.US);
        } else {
            if (!"ok".equals(ttsState)) return;
            if (esVoice != null) tts.setVoice(esVoice); else tts.setLanguage(new Locale("es", "ES"));
        }
        tts.setSpeechRate(Math.max(0.3f, Math.min(2f, rate)));
        tts.speak(text, queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, null, "adj" + (utterance++));
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
        @JavascriptInterface
        public void speak(String text, float rate) {
            say(text, rate, "es", false);
        }

        /** lang is "es" or "en". */
        @JavascriptInterface
        public void speakIn(String text, float rate, String lang, boolean queue) {
            say(text, rate, lang, queue);
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) tts.stop();
        }

        @JavascriptInterface
        public String ttsState() {
            return ttsState;
        }

        /** {google, current, voices: [{name, locale, quality}]} */
        @JavascriptInterface
        public String voiceInfo() {
            try {
                JSONObject o = new JSONObject();
                o.put("google", hasGoogleTts());
                o.put("current", currentVoice);
                JSONArray arr = new JSONArray();
                for (Voice v : voices) {
                    JSONObject j = new JSONObject();
                    j.put("name", v.getName());
                    j.put("locale", v.getLocale().toLanguageTag());
                    j.put("quality", v.getQuality());
                    arr.put(j);
                }
                o.put("voices", arr);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void setVoice(String name) {
            wantedVoice = name == null ? "" : name;
            if (!"init".equals(ttsState)) applyVoice();
        }

        /** Opens the screen that downloads voice data (Google's when available). */
        @JavascriptInterface
        public void installVoice() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent settings = new Intent("com.android.settings.TTS_SETTINGS");
                    if (hasGoogleTts()) {
                        open(new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).setPackage(GOOGLE_TTS), settings);
                    } else {
                        // No Google engine at all: send them to "Speech Services by Google" on the Play Store.
                        open(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + GOOGLE_TTS)), settings);
                    }
                }
            });
        }

        @JavascriptInterface
        public void openTtsSettings() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    open(new Intent("com.android.settings.TTS_SETTINGS"), new Intent(android.provider.Settings.ACTION_SETTINGS));
                }
            });
        }

        /** Opens Android's share sheet (WhatsApp, Snapchat, TikTok…) with the given text. */
        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    open(Intent.createChooser(send, "Share Adjetivos"), null);
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 400)));
        }
    }

    @Override
    public void onBackPressed() {
        // Let the game close whatever is open first; leave only from the home screen.
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
        if (!"init".equals(ttsState) && !"error".equals(ttsState)) {
            applyVoice();
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
