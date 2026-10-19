package com.olrock.globetrot;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Hosts the map (plain HTML/JS in assets/) in a full-screen WebView and lends
 * it what a WebView lacks: the share sheet, the clipboard, vibration, a file
 * picker, and the phone's photos (see Photos). No internet permission;
 * everything stays on the phone.
 */
public class MainActivity extends Activity {
    private static final int BG = Color.rgb(10, 15, 30);
    private static final int PICK_FILE = 1;
    private static final int ASK_PHOTOS = 2;

    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Photos photos;
    private volatile String scanResult = "[]";
    private volatile boolean scanning;
    private boolean scanAfterAsking;

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

        photos = new Photos(this);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (Photos.HOST.equals(u.getHost())) return photos.serve(u);
                return null;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = callback;
                String[] accept = params.getAcceptTypes();
                boolean images = accept != null && accept.length > 0 && accept[0].startsWith("image/");
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                // Backups saved to Drive often lose their .json type, so those accept anything.
                pick.setType(images ? "image/*" : "*/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, images ? "Add photos" : "Restore a Globetrot backup"), PICK_FILE);
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
            Uri[] picked = null;
            // parseResult only knows about one file; several come back as ClipData.
            if (resultCode == RESULT_OK && data != null && data.getClipData() != null) {
                ClipData clip = data.getClipData();
                picked = new Uri[clip.getItemCount()];
                for (int i = 0; i < picked.length; i++) picked[i] = clip.getItemAt(i).getUri();
            } else {
                picked = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
            pending.onReceiveValue(picked);
            pending = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ------------------------------------------------------------ photo access

    private boolean granted(String permission) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** Can we see at least some photos? (Android 14 lets people share just a few.) */
    private boolean canSeePhotos() {
        if (Build.VERSION.SDK_INT >= 34) {
            return granted("android.permission.READ_MEDIA_IMAGES") || granted("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
        }
        if (Build.VERSION.SDK_INT >= 33) return granted("android.permission.READ_MEDIA_IMAGES");
        return granted("android.permission.READ_EXTERNAL_STORAGE");
    }

    /** Everything a full scan wants: all photos, and their locations on Android 10+. */
    private String[] missingPermissions() {
        List<String> want = new ArrayList<String>();
        if (Build.VERSION.SDK_INT >= 33) {
            want.add("android.permission.READ_MEDIA_IMAGES");
            if (Build.VERSION.SDK_INT >= 34) want.add("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
        } else {
            want.add("android.permission.READ_EXTERNAL_STORAGE");
        }
        if (Build.VERSION.SDK_INT >= 29) want.add("android.permission.ACCESS_MEDIA_LOCATION");
        List<String> missing = new ArrayList<String>();
        for (String p : want) if (!granted(p)) missing.add(p);
        // On Android 14 a partial choice leaves READ_MEDIA_IMAGES ungranted; asking
        // again lets the person pick more photos or allow all of them.
        if (Build.VERSION.SDK_INT >= 34 && !granted("android.permission.READ_MEDIA_IMAGES")
                && !missing.contains("android.permission.READ_MEDIA_VISUAL_USER_SELECTED")) {
            missing.add("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
        }
        return missing.toArray(new String[0]);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != ASK_PHOTOS || !scanAfterAsking) return;
        scanAfterAsking = false;
        if (canSeePhotos()) startScan();
        else emit("{\"state\":\"denied\"}");
    }

    private void startScan() {
        if (scanning) return;
        scanning = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                String result = "[]";
                try {
                    result = photos.scan(new Photos.Progress() {
                        @Override
                        public void update(int done, int total) {
                            emit("{\"state\":\"progress\",\"done\":" + done + ",\"total\":" + total + "}");
                        }
                    });
                } finally {
                    scanResult = result;
                    scanning = false;
                    boolean location = Build.VERSION.SDK_INT < 29 || granted("android.permission.ACCESS_MEDIA_LOCATION");
                    emit("{\"state\":\"done\",\"total\":" + photos.lastTotal + ",\"location\":" + location + "}");
                }
            }
        }, "photo-scan").start();
    }

    /** Tells the page how a scan is going (see window.onPhotoScan in photos.js). */
    private void emit(final String json) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.onPhotoScan && window.onPhotoScan(" + JSONObject.quote(json) + ")", null);
            }
        });
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
        public String hasPhotoAccess() {
            return canSeePhotos() ? "yes" : "no";
        }

        /** Finds photos with a location; ask=true may show Android's permission prompt first. */
        @JavascriptInterface
        public void scanPhotos(final boolean ask) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String[] missing = missingPermissions();
                    if (ask && missing.length > 0 && Build.VERSION.SDK_INT >= 23) {
                        scanAfterAsking = true;
                        requestPermissions(missing, ASK_PHOTOS);
                    } else if (canSeePhotos()) {
                        startScan();
                    } else {
                        emit("{\"state\":\"denied\"}");
                    }
                }
            });
        }

        @JavascriptInterface
        public String photoScanResult() {
            return scanResult;
        }

        @JavascriptInterface
        public void savePhoto(String name, String base64) {
            photos.save(name, base64);
        }

        @JavascriptInterface
        public void deletePhoto(String name) {
            photos.delete(name);
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
