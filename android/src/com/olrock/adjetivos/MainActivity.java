package com.olrock.adjetivos;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

/**
 * Hosts the game (plain HTML/JS in assets/) in a full-screen WebView and
 * lends it the two things a WebView lacks: Spanish text-to-speech and
 * vibration. Everything runs offline.
 */
public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int BG = Color.rgb(11, 11, 30);

    private WebView web;
    private TextToSpeech tts;
    // "init" until the engine answers, then "ok", "missing" (no Spanish voice) or "error".
    private volatile String ttsState = "init";

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

        tts = new TextToSpeech(this, this);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            ttsState = "error";
            return;
        }
        int r = tts.setLanguage(new Locale("es", "ES"));
        if (r < 0) r = tts.setLanguage(new Locale("es"));
        ttsState = r < 0 ? "missing" : "ok";
    }

    /** Exposed to JavaScript as window.Native. */
    private class Bridge {
        @JavascriptInterface
        public void speak(String text, float rate) {
            if (tts == null || !"ok".equals(ttsState)) return;
            tts.setSpeechRate(Math.max(0.3f, Math.min(2f, rate)));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "adj");
        }

        @JavascriptInterface
        public void stop() {
            if (tts != null) tts.stop();
        }

        @JavascriptInterface
        public String ttsState() {
            return ttsState;
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
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
