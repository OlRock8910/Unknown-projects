package com.olrock.globetrot;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Vibrator;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Hosts the map (plain HTML/JS in assets/) in a full-screen WebView and lends
 * it what a WebView lacks: the share sheet, the clipboard, vibration and a
 * file picker for restoring backups. No internet permission; everything stays
 * on the phone.
 */
public class MainActivity extends Activity {
    private static final int BG = Color.rgb(10, 15, 30);
    private static final int PICK_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(Color.rgb(12, 18, 36));

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true; // long press pins a place; no text-selection popup
            }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*"); // backups saved to Drive often lose their .json type
                try {
                    startActivityForResult(Intent.createChooser(pick, "Restore a Globetrot backup"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pending = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && pending != null) {
            pending.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pending = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void open(Intent i) {
        try {
            startActivity(i);
        } catch (ActivityNotFoundException ignored) {
        }
    }

    /** Exposed to JavaScript as window.Native. */
    private class Bridge {
        /** Opens Android's share sheet with the given text. */
        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    open(Intent.createChooser(send, "Share your travels"));
                }
            });
        }

        /**
         * Writes base64 data to the app's cache and offers it to the share
         * sheet (the map picture, or a backup to save to Drive or email).
         */
        @JavascriptInterface
        public void shareFile(String name, final String mime, String base64, final String text) {
            final String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            try {
                File dir = new File(getCacheDir(), ShareProvider.DIR);
                dir.mkdirs();
                FileOutputStream out = new FileOutputStream(new File(dir, safe));
                try {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                } finally {
                    out.close();
                }
            } catch (Exception e) {
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + safe);
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
                    send.setClipData(ClipData.newRawUri(safe, uri));
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    open(Intent.createChooser(send, "Share").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Globetrot", text));
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 200)));
        }
    }

    @Override
    public void onBackPressed() {
        // Let the page close whatever is open first; leave only from the map.
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
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
