package com.reelbox.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Saves songs into the phone's music library, from a download link or from a
 * file another app shared. Each song lands in a folder, and every folder is a
 * playlist in the app.
 */
final class SongSaver {

    /** A failure worth showing to the user as is. */
    static final class Problem extends Exception {

        Problem(String message) {
            super(message);
        }
    }

    interface Progress {
        void update(long received, long total);
    }

    /** Top-level folders Android lets an app put audio into. */
    private static final String[] AUDIO_ROOTS = { "Music", "Podcasts", "Audiobooks", "Recordings", "Ringtones", "Alarms", "Notifications" };

    private static final Pattern AUDIO_NAME = Pattern.compile("(?i).+\\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|amr)$");
    private static final Pattern DISPOSITION_NAME = Pattern.compile("(?i)filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?");
    private static final long MAX_BYTES = 1024L * 1024 * 1024;

    private SongSaver() {}

    /** Downloads `link` into `folder`; returns the saved file's name. */
    static String download(Context context, String link, String folder, Progress progress) throws Exception {
        URL url = new URL(link);
        if (!"https".equals(url.getProtocol())) throw new Problem("Use a link that starts with https://");
        HttpURLConnection c;
        for (int hops = 0;; hops++) {
            c = (HttpURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "ReelBox (Android)");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = c.getHeaderField("Location");
                c.disconnect();
                if (location == null || hops >= 5) throw new Problem("That link keeps redirecting.");
                url = new URL(url, location);
                if (!"https".equals(url.getProtocol())) throw new Problem("That link leads to an insecure (http) address.");
                continue;
            }
            if (code == 401 || code == 403) throw new Problem("That site won't let the file be downloaded.");
            if (code == 404) throw new Problem("Nothing was found at that link.");
            if (code != 200) throw new Problem("The site answered with an error (" + code + ").");
            break;
        }
        try {
            String type = c.getContentType() == null ? "" : c.getContentType().split(";")[0].trim().toLowerCase(Locale.ROOT);
            String name = withExtension(nameFrom(c, url), type);
            boolean audio = type.startsWith("audio/") || (AUDIO_NAME.matcher(name).matches() && !type.startsWith("text/"));
            if (!audio) {
                throw new Problem(
                    "That link opens a web page, not a song file. Use a direct link to an MP3 or other audio file."
                );
            }
            long total = -1;
            try {
                total = Long.parseLong(c.getHeaderField("Content-Length"));
            } catch (Exception ignored) {}
            if (total > MAX_BYTES) throw new Problem("That file is too big to be a song.");
            String mime = type.startsWith("audio/") ? type : mimeFor(name);
            try (InputStream in = c.getInputStream()) {
                return save(context, in, name, mime, folder, total, progress);
            }
        } finally {
            c.disconnect();
        }
    }

    /** Copies a file another app shared into `folder`; returns its name. */
    static String saveShared(Context context, Uri uri, String folder) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                name = c.getString(0);
                if (!c.isNull(1)) size = c.getLong(1);
            }
        } catch (Exception ignored) {}
        String type = resolver.getType(uri);
        if (name == null || name.trim().isEmpty()) name = "Shared song";
        name = withExtension(clean(name), type == null ? "" : type);
        String mime = type != null && type.startsWith("audio/") ? type : mimeFor(name);
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new Problem("Couldn't open " + name + ".");
            return save(context, in, name, mime, folder, size, null);
        }
    }

    /** Name, size and type of a shared file, for the "Save to" screen. */
    static String displayName(Context context, Uri uri) {
        try (Cursor c = context.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        return last == null ? "Song" : last;
    }

    /** "Songs/Chill" → "Music/Songs/Chill": Android only takes audio under its music-type folders. */
    static String relativePath(String folder) {
        StringBuilder path = new StringBuilder();
        for (String part : (folder == null ? "" : folder).split("/")) {
            String p = clean(part).trim();
            if (p.isEmpty() || p.equals(".") || p.equals("..")) continue;
            if (path.length() > 0) path.append('/');
            path.append(p);
        }
        if (path.length() == 0) path.append("ReelBox Downloads");
        String first = path.toString().split("/")[0];
        for (String root : AUDIO_ROOTS) {
            if (root.equalsIgnoreCase(first)) return path.toString();
        }
        return "Music/" + path;
    }

    private static String save(Context context, InputStream in, String name, String mime, String folder, long total, Progress progress)
        throws Exception {
        String rel = relativePath(folder);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Audio.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Audio.Media.MIME_TYPE, mime);
            values.put(MediaStore.Audio.Media.RELATIVE_PATH, rel + "/");
            values.put(MediaStore.Audio.Media.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
            if (uri == null) throw new Problem("Couldn't create the file on the phone.");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new Problem("Couldn't write the file on the phone.");
                copy(in, out, total, progress);
            } catch (Exception e) {
                resolver.delete(uri, null, null);
                throw e;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Audio.Media.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            String path = null;
            try (Cursor c = resolver.query(uri, new String[] { MediaStore.Audio.Media.DATA, MediaStore.Audio.Media.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    path = c.getString(0);
                    if (c.getString(1) != null) name = c.getString(1);
                }
            }
            // Read the tags (title, artist, length) now so the song shows up straight away.
            if (path != null) scan(context, path, mime);
            return name;
        }
        File dir = new File(Environment.getExternalStorageDirectory(), rel);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File file = unique(dir, name);
        try (OutputStream out = new FileOutputStream(file)) {
            copy(in, out, total, progress);
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            throw e;
        }
        scan(context, file.getPath(), mime);
        return file.getName();
    }

    private static void copy(InputStream in, OutputStream out, long total, Progress progress) throws IOException, Problem {
        byte[] buf = new byte[64 * 1024];
        long received = 0;
        long lastReport = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            received += n;
            if (received > MAX_BYTES) throw new Problem("That file is too big to be a song.");
            long now = System.currentTimeMillis();
            if (progress != null && now - lastReport > 250) {
                lastReport = now;
                progress.update(received, total);
            }
        }
        if (progress != null) progress.update(received, total);
        if (received == 0) throw new Problem("The file was empty.");
    }

    private static void scan(Context context, String path, String mime) {
        CountDownLatch done = new CountDownLatch(1);
        MediaScannerConnection.scanFile(context, new String[] { path }, new String[] { mime }, (p, u) -> done.countDown());
        try {
            done.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private static String nameFrom(HttpURLConnection c, URL url) {
        String disposition = c.getHeaderField("Content-Disposition");
        if (disposition != null) {
            Matcher m = DISPOSITION_NAME.matcher(disposition);
            if (m.find()) return clean(decode(m.group(1)));
        }
        String path = url.getPath();
        String last = path == null ? "" : path.substring(path.lastIndexOf('/') + 1);
        last = clean(decode(last));
        return last.isEmpty() ? "Downloaded song" : last;
    }

    private static String withExtension(String name, String type) {
        if (AUDIO_NAME.matcher(name).matches()) return name;
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
        if (ext == null && "audio/mpeg".equals(type)) ext = "mp3";
        return ext == null ? name : name + "." + ext;
    }

    private static String mimeFor(String name) {
        String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime == null ? "audio/mpeg" : mime;
    }

    private static String decode(String s) {
        try {
            return URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    /** Keeps a name safe to use as a file or folder name. */
    private static String clean(String s) {
        String out = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        return out.length() > 120 ? out.substring(0, 120).trim() : out;
    }

    private static File unique(File dir, String name) {
        File f = new File(dir, name);
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; f.exists(); i++) f = new File(dir, base + " (" + i + ")" + ext);
        return f;
    }
}
