package com.reelbox.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import android.app.Activity;
import android.content.ClipData;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lists the videos and music on the phone, switches the window in and out of
 * the full-screen player, and drives the lock-screen controls. The media
 * bytes themselves are served by {@link MediaWebViewClient}, not through this
 * bridge.
 */
@CapacitorPlugin(
    name = "Gallery",
    permissions = {
        // Android 12 and older: one broad storage permission.
        @Permission(alias = GalleryPlugin.LEGACY, strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        // Android 9 and older: needed to save downloaded or shared songs.
        @Permission(alias = GalleryPlugin.WRITE, strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }),
        // Android 13: videos and music.
        @Permission(
            alias = GalleryPlugin.MEDIA,
            strings = { Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO }
        ),
        // Android 14+: the user may instead pick just some videos.
        @Permission(
            alias = GalleryPlugin.MEDIA_OR_PICKED,
            strings = {
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
            }
        )
    }
)
public class GalleryPlugin extends Plugin {

    static final String LEGACY = "legacy";
    static final String MEDIA = "media";
    static final String MEDIA_OR_PICKED = "mediaOrPicked";
    static final String WRITE = "write";

    private static final Pattern LINK = Pattern.compile("https://\\S+");

    /** Downloads and copies run one at a time, off the bridge's thread. */
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    /** Files shared into the app, waiting for the user to pick a folder. */
    private final Map<String, Uri> shared = new HashMap<>();
    private int sharedCounter;

    private static final String PREFS = "reelbox";

    /** The live instance, so the playback service can pass lock-screen buttons back to JS. */
    private static GalleryPlugin instance;

    @Override
    public void load() {
        instance = this;
        // Opened from the Share menu while the app was not running.
        received(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        received(intent);
    }

    /**
     * Songs or a link shared from another app. They are announced to the page
     * (kept until it is listening) and saved once the user picks a folder.
     */
    private void received(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        JSArray files = new JSArray();
        for (Uri uri : uris) {
            String id = "s" + (++sharedCounter);
            shared.put(id, uri);
            JSObject f = new JSObject();
            f.put("id", id);
            f.put("name", SongSaver.displayName(getContext(), uri));
            files.put(f);
        }
        JSObject data = new JSObject();
        data.put("files", files);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (uris.isEmpty() && text != null) {
            Matcher m = LINK.matcher(text);
            if (m.find()) data.put("link", m.group());
        }
        // Handled once; do not offer it again if the activity is recreated.
        intent.setAction(Intent.ACTION_MAIN);
        if (files.length() > 0 || data.has("link")) notifyListeners("shared", data, true);
    }

    /**
     * Opens the phone's own picker so the user can choose videos themselves.
     * Resolves with the gallery ids of what was picked.
     */
    @PluginMethod
    public void pickVideos(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 33) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            intent.setType("video/*");
            intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MediaStore.getPickImagesMaxLimit());
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("video/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        startActivityForResult(call, intent, "onVideosPicked");
    }

    @ActivityCallback
    private void onVideosPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        List<Uri> uris = new ArrayList<>();
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }
        io.execute(() -> {
            JSArray ids = new JSArray();
            int missing = 0;
            for (Uri uri : uris) {
                Long id = galleryIdFor(uri);
                if (id == null) missing++;
                else ids.put(String.valueOf(id));
            }
            JSObject out = new JSObject();
            out.put("ids", ids);
            out.put("missing", missing);
            call.resolve(out);
        });
    }

    /**
     * Turns a picked file into its gallery (MediaStore) id: from the id in
     * the link when it checks out, else by finding the same name and size.
     */
    private Long galleryIdFor(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                name = c.getString(0);
                if (!c.isNull(1)) size = c.getLong(1);
            }
        } catch (Exception ignored) {}
        Long id = null;
        try {
            String tail = DocumentsContract.isDocumentUri(getContext(), uri) ? DocumentsContract.getDocumentId(uri) : uri.getLastPathSegment();
            if (tail != null) id = Long.parseLong(tail.substring(tail.indexOf(':') + 1));
        } catch (Exception ignored) {}
        if (id != null && videoMatches(id, name, size)) return id;
        if (name == null) return null;
        String where = MediaStore.Video.Media.DISPLAY_NAME + " = ?" + (size >= 0 ? " AND " + MediaStore.Video.Media.SIZE + " = ?" : "");
        String[] args = size >= 0 ? new String[] { name, String.valueOf(size) } : new String[] { name };
        try (Cursor c = resolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, new String[] { MediaStore.Video.Media._ID }, where, args, null)) {
            if (c != null && c.moveToFirst()) return c.getLong(0);
        } catch (Exception ignored) {}
        return null;
    }

    private boolean videoMatches(long id, String name, long size) {
        try (
            Cursor c = getContext()
                .getContentResolver()
                .query(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    new String[] { MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.SIZE },
                    MediaStore.Video.Media._ID + " = ?",
                    new String[] { String.valueOf(id) },
                    null
                )
        ) {
            if (c == null || !c.moveToFirst()) return false;
            if (size >= 0) return c.getLong(1) == size;
            return name == null || name.equals(c.getString(0));
        } catch (Exception e) {
            return false;
        }
    }

    /** Android 9 and older need permission to write into the music folder. */
    private boolean needsWrite() {
        return Build.VERSION.SDK_INT < 29 && !granted(Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    @PluginMethod
    public void downloadSong(PluginCall call) {
        if (needsWrite()) {
            requestPermissionForAlias(WRITE, call, "afterWriteForDownload");
            return;
        }
        String url = call.getString("url", "").trim();
        String folder = call.getString("folder", "");
        io.execute(() -> {
            try {
                String name = SongSaver.download(getContext(), url, folder, (got, total) -> {
                    JSObject p = new JSObject();
                    p.put("url", url);
                    p.put("received", got);
                    p.put("total", total);
                    notifyListeners("downloadProgress", p);
                });
                JSObject result = new JSObject();
                result.put("name", name);
                result.put("folder", SongSaver.relativePath(folder));
                call.resolve(result);
            } catch (SongSaver.Problem e) {
                call.reject(e.getMessage());
            } catch (java.net.UnknownHostException e) {
                call.reject("Couldn't reach that site. Check the link and your internet connection.");
            } catch (java.net.SocketTimeoutException e) {
                call.reject("The site took too long to answer.");
            } catch (Exception e) {
                call.reject("The download failed: " + e.getMessage());
            }
        });
    }

    @PermissionCallback
    private void afterWriteForDownload(PluginCall call) {
        if (needsWrite()) call.reject("ReelBox needs permission to save songs.");
        else downloadSong(call);
    }

    @PluginMethod
    public void saveShared(PluginCall call) {
        if (needsWrite()) {
            requestPermissionForAlias(WRITE, call, "afterWriteForShared");
            return;
        }
        JSArray ids = call.getArray("ids", new JSArray());
        String folder = call.getString("folder", "");
        io.execute(() -> {
            int saved = 0;
            int failed = 0;
            String lastError = null;
            for (int i = 0; i < ids.length(); i++) {
                Uri uri = shared.remove(ids.optString(i));
                if (uri == null) {
                    failed++;
                    continue;
                }
                try {
                    SongSaver.saveShared(getContext(), uri, folder);
                    saved++;
                } catch (Exception e) {
                    failed++;
                    lastError = e.getMessage();
                }
            }
            JSObject result = new JSObject();
            result.put("saved", saved);
            result.put("failed", failed);
            result.put("folder", SongSaver.relativePath(folder));
            if (lastError != null) result.put("error", lastError);
            call.resolve(result);
        });
    }

    @PermissionCallback
    private void afterWriteForShared(PluginCall call) {
        if (needsWrite()) call.reject("ReelBox needs permission to save songs.");
        else saveShared(call);
    }

    /** Called by {@link MediaPlaybackService} for lock-screen, notification and headphone buttons. */
    static void emitMediaAction(String action, double positionSeconds) {
        GalleryPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (positionSeconds >= 0) data.put("position", positionSeconds);
        plugin.notifyListeners("mediaAction", data);
    }

    @PluginMethod
    public void access(PluginCall call) {
        call.resolve(accessState());
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        getContext().getSharedPreferences(PREFS, 0).edit().putBoolean("asked", true).apply();
        String alias = Build.VERSION.SDK_INT >= 34 ? MEDIA_OR_PICKED : Build.VERSION.SDK_INT >= 33 ? MEDIA : LEGACY;
        requestPermissionForAlias(alias, call, "onAccessResult");
    }

    @PermissionCallback
    private void onAccessResult(PluginCall call) {
        call.resolve(accessState());
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void list(PluginCall call) {
        if ("none".equals(access())) {
            call.reject("No permission to read videos");
            return;
        }
        String[] columns = {
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.TITLE,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.DATE_MODIFIED,
            MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT,
            // Where it lives, so whole apps (WhatsApp, Snapchat...) or folders can be left out.
            Build.VERSION.SDK_INT >= 29 ? MediaStore.Video.Media.RELATIVE_PATH : MediaStore.Video.Media.DATA,
        };
        String storageRoot = Environment.getExternalStorageDirectory().getPath() + "/";
        JSArray videos = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        try (
            Cursor c = resolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                columns,
                null,
                null,
                MediaStore.Video.Media.DATE_ADDED + " DESC"
            )
        ) {
            if (c != null) {
                while (c.moveToNext()) {
                    long size = c.getLong(5);
                    if (size <= 0) continue; // still being written, or an empty placeholder
                    String name = c.getString(1);
                    String title = c.getString(2);
                    JSObject v = new JSObject();
                    v.put("id", c.getLong(0));
                    v.put("title", niceTitle(title, name));
                    v.put("folder", c.getString(3) == null ? "Videos" : c.getString(3));
                    v.put("duration", c.getLong(4));
                    v.put("size", size);
                    v.put("dateAdded", c.getLong(6));
                    v.put("modified", c.getLong(7));
                    v.put("width", c.getInt(8));
                    v.put("height", c.getInt(9));
                    String path = c.getString(10);
                    if (Build.VERSION.SDK_INT < 29 && path != null) {
                        File parent = new File(path).getParentFile();
                        path = parent == null ? null : parent.getPath();
                        if (path != null && path.startsWith(storageRoot)) path = path.substring(storageRoot.length());
                    }
                    if (path != null) path = path.replaceAll("/+$", "");
                    v.put("path", path == null ? "" : path);
                    videos.put(v);
                }
            }
        } catch (Exception e) {
            call.reject("Could not read the gallery", e);
            return;
        }
        JSObject result = new JSObject();
        result.put("videos", videos);
        call.resolve(result);
    }

    @PluginMethod
    public void listMusic(PluginCall call) {
        if (!musicAllowed()) {
            call.reject("No permission to read music");
            return;
        }
        boolean hasBucket = Build.VERSION.SDK_INT >= 29;
        String[] columns = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.DATE_MODIFIED,
            MediaStore.Audio.Media.TRACK,
            // Android 10+: the folder's name and path; older: the file's full path.
            hasBucket ? MediaStore.Audio.Media.BUCKET_DISPLAY_NAME : MediaStore.Audio.Media.DATA,
            hasBucket ? MediaStore.Audio.Media.RELATIVE_PATH : MediaStore.Audio.Media.DATA,
        };
        String storageRoot = Environment.getExternalStorageDirectory().getPath() + "/";
        // Songs and other long audio; not ringtones, alarms or notification sounds.
        String where =
            MediaStore.Audio.Media.IS_RINGTONE +
            " = 0 AND " +
            MediaStore.Audio.Media.IS_ALARM +
            " = 0 AND " +
            MediaStore.Audio.Media.IS_NOTIFICATION +
            " = 0 AND " +
            MediaStore.Audio.Media.DURATION +
            " >= 20000";
        JSArray songs = new JSArray();
        try (
            Cursor c = getContext()
                .getContentResolver()
                .query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, columns, where, null, MediaStore.Audio.Media.DATE_ADDED + " DESC")
        ) {
            if (c != null) {
                while (c.moveToNext()) {
                    long size = c.getLong(7);
                    if (size <= 0) continue;
                    String artist = c.getString(3);
                    if (artist == null || "<unknown>".equals(artist)) artist = "";
                    String album = c.getString(4);
                    if (album == null || "<unknown>".equals(album)) album = "";
                    String folder = c.getString(11);
                    String path = c.getString(12);
                    if (!hasBucket && path != null) {
                        File parent = new File(path).getParentFile();
                        folder = parent == null ? null : parent.getName();
                        path = parent == null ? null : parent.getPath();
                        if (path != null && path.startsWith(storageRoot)) path = path.substring(storageRoot.length());
                    }
                    // "Music/Songs/Chill/" → "Music/Songs/Chill": each folder becomes a playlist.
                    if (path != null) path = path.replaceAll("/+$", "");
                    JSObject s = new JSObject();
                    s.put("id", c.getLong(0));
                    s.put("title", niceTitle(c.getString(1), c.getString(2)));
                    s.put("artist", artist);
                    s.put("album", album);
                    s.put("albumId", c.getLong(5));
                    s.put("duration", c.getLong(6));
                    s.put("size", size);
                    s.put("dateAdded", c.getLong(8));
                    s.put("modified", c.getLong(9));
                    s.put("folder", folder == null ? "Music" : folder);
                    s.put("path", path == null || path.isEmpty() ? (folder == null ? "Music" : folder) : path);
                    s.put("track", c.getInt(10));
                    songs.put(s);
                }
            }
        } catch (Exception e) {
            call.reject("Could not read music", e);
            return;
        }
        JSObject result = new JSObject();
        result.put("songs", songs);
        call.resolve(result);
    }

    /**
     * Shows or updates the playback notification and lock-screen controls.
     * While something plays, a foreground service keeps the app (and the
     * WebView doing the playing) alive with the screen off.
     */
    @PluginMethod
    public void nowPlaying(PluginCall call) {
        MediaPlaybackService.Info info = new MediaPlaybackService.Info();
        info.kind = call.getString("kind", "music");
        info.id = call.getString("id", "");
        info.title = call.getString("title", "");
        info.artist = call.getString("artist", "");
        info.art = call.getString("art", "");
        info.durationMs = (long) (call.getDouble("duration", 0.0) * 1000);
        info.positionMs = (long) (call.getDouble("position", 0.0) * 1000);
        info.playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        info.canPrev = Boolean.TRUE.equals(call.getBoolean("canPrev", true));
        info.canNext = Boolean.TRUE.equals(call.getBoolean("canNext", false));
        info.canLike = Boolean.TRUE.equals(call.getBoolean("canLike", false));
        info.liked = Boolean.TRUE.equals(call.getBoolean("liked", false));
        getActivity().runOnUiThread(() -> {
            MediaPlaybackService.show(getContext(), info);
            call.resolve();
        });
    }

    @PluginMethod
    public void stopNowPlaying(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MediaPlaybackService.hide();
            call.resolve();
        });
    }

    /** Full screen, screen kept on, and turned sideways for landscape videos. */
    @PluginMethod
    public void setPlayerMode(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        getActivity()
            .runOnUiThread(() -> {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
                if (on) {
                    bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    bars.hide(WindowInsetsCompat.Type.systemBars());
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    getActivity()
                        .setRequestedOrientation(
                            landscape ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                        );
                } else {
                    bars.show(WindowInsetsCompat.Type.systemBars());
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
                call.resolve();
            });
    }

    private JSObject accessState() {
        String access = access();
        boolean music = musicAllowed();
        JSObject state = new JSObject();
        state.put("access", access);
        state.put("canAsk", canAsk(access));
        state.put("music", music);
        state.put("musicCanAsk", music || canAskFor(Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_AUDIO : Manifest.permission.READ_EXTERNAL_STORAGE));
        return state;
    }

    private boolean musicAllowed() {
        return granted(Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_AUDIO : Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private String access() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (granted(Manifest.permission.READ_MEDIA_VIDEO)) return "full";
            if (Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)) return "partial";
            return "none";
        }
        return granted(Manifest.permission.READ_EXTERNAL_STORAGE) ? "full" : "none";
    }

    /** After two refusals Android stops showing the dialog; only Settings can grant it then. */
    private boolean canAsk(String access) {
        if (!"none".equals(access)) return true;
        return canAskFor(Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_VIDEO : Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private boolean canAskFor(String permission) {
        boolean asked = getContext().getSharedPreferences(PREFS, 0).getBoolean("asked", false);
        if (!asked) return true;
        return getActivity().shouldShowRequestPermissionRationale(permission);
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** "VID_20240512_181502.mp4" reads worse than its title; prefer the title unless it is empty. */
    private static String niceTitle(String title, String name) {
        String t = title != null && !title.trim().isEmpty() ? title : name;
        if (t == null) return "Video";
        int dot = t.lastIndexOf('.');
        return dot > 0 && t.length() - dot <= 5 ? t.substring(0, dot) : t;
    }
}
