package com.olrock.spark;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts Spark (plain HTML/JS in assets/) in a full-screen WebView.
 *
 * The app's files are served from https://appassets.androidplatform.net/
 * instead of file://, so the page is a secure origin: the browser-side Claude
 * API calls, the clipboard and local storage all behave as they do on the
 * website. The pages are also marked cross-origin isolated, which lets the
 * free on-phone brain use every processor core. The WebView also gets a photo
 * picker for the attach button, opens outside links in the browser, and hands
 * the back button to the page.
 *
 * The app asks Android for one permission only: the internet.
 */
public class MainActivity extends Activity {
    private static final int BG = Color.rgb(17, 16, 21);
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_PHOTOS = 1;

    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    Map<String, String> headers = new HashMap<String, String>();
                    headers.put("Cross-Origin-Opener-Policy", "same-origin");
                    headers.put("Cross-Origin-Embedder-Policy", "require-corp");
                    return new WebResourceResponse(mime(path), mime(path).startsWith("text/") ? "utf-8" : null, 200, "OK", headers, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (HOST.equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // No browser: stay put.
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Add a photo"), PICK_PHOTOS);
                } catch (ActivityNotFoundException e) {
                    pending = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "SparkAndroid");
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_PHOTOS || pending == null) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] picked = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clips = data.getClipData();
            if (clips != null) {
                picked = new Uri[clips.getItemCount()];
                for (int i = 0; i < picked.length; i++) picked[i] = clips.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                picked = new Uri[] { data.getData() };
            }
        }
        pending.onReceiveValue(picked);
        pending = null;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.sparkBack ? sparkBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    /** Called from the page as window.SparkAndroid. */
    private class Bridge {
        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Spark", text));
        }
    }
}
