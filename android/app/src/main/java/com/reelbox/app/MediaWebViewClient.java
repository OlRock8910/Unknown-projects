package com.reelbox.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Size;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves gallery videos, music and their pictures to the web layer:
 *
 *   /_media/video/{id}   the video, with byte ranges so the player can seek
 *   /_media/thumb/{id}   a cached JPEG poster frame
 *   /_media/audio/{id}   a song, with byte ranges
 *   /_media/art/{id}     its cover art (?album= for Android 9 and older)
 *
 * About ranges: WebView parses the request's Range header itself and skips
 * the returned stream to the first requested byte, using available() as the
 * total size. So the stream handed back always starts at byte 0, reports how
 * much is left, and the response only adds the 206 status and Content-Range
 * the media player needs to treat it as seekable.
 */
public class MediaWebViewClient extends BridgeWebViewClient {

    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");

    private final Context context;

    public MediaWebViewClient(Bridge bridge) {
        super(bridge);
        this.context = bridge.getContext().getApplicationContext();
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        List<String> seg = url.getPathSegments();
        if ("localhost".equals(url.getHost()) && seg.size() == 3 && "_media".equals(seg.get(0))) {
            long id;
            try {
                id = Long.parseLong(seg.get(2));
            } catch (NumberFormatException e) {
                return status(400, "Bad Request");
            }
            Uri videoUri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
            Uri audioUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
            switch (seg.get(1)) {
                case "video":
                    return video(videoUri, header(request, "Range"), "video/mp4");
                case "audio":
                    return video(audioUri, header(request, "Range"), "audio/mpeg");
                case "thumb":
                    return image(cachedImage(context, false, id, url.getQueryParameter("m"), null));
                case "art":
                    return image(cachedImage(context, true, id, url.getQueryParameter("m"), url.getQueryParameter("album")));
                default:
                    return status(404, "Not Found");
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    private WebResourceResponse video(Uri uri, String range, String fallbackMime) {
        ContentResolver resolver = context.getContentResolver();
        AssetFileDescriptor afd;
        try {
            afd = resolver.openAssetFileDescriptor(uri, "r");
        } catch (Exception e) {
            return status(404, "Not Found");
        }
        if (afd == null) return status(404, "Not Found");

        long total = afd.getLength();
        if (total == AssetFileDescriptor.UNKNOWN_LENGTH) total = afd.getParcelFileDescriptor().getStatSize();
        // WebView measures the body with an int; past 2 GB only the first 2 GB is reachable.
        long served = Math.min(total, Integer.MAX_VALUE);
        InputStream body;
        try {
            body = new SizedStream(afd.createInputStream(), served);
        } catch (IOException e) {
            closeQuietly(afd);
            return status(404, "Not Found");
        }

        String mime = resolver.getType(uri);
        if (mime == null) mime = fallbackMime;
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Cache-Control", "no-store");

        if (range == null) return new WebResourceResponse(mime, null, 200, "OK", headers, body);

        long start = 0;
        long end = served - 1;
        Matcher m = RANGE.matcher(range.trim());
        if (m.matches()) {
            String a = m.group(1);
            String b = m.group(2);
            if (a.isEmpty() && !b.isEmpty()) {
                start = Math.max(0, served - Long.parseLong(b)); // "bytes=-500": the last 500
            } else {
                if (!a.isEmpty()) start = Long.parseLong(a);
                if (!b.isEmpty()) end = Math.min(end, Long.parseLong(b));
            }
        }
        if (start >= served || start > end) {
            closeQuietly(body);
            headers.put("Content-Range", "bytes */" + total);
            return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0]));
        }
        headers.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
        return new WebResourceResponse(mime, null, 206, "Partial Content", headers, body);
    }

    private static WebResourceResponse image(File file) {
        if (file == null) return status(404, "Not Found");
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "max-age=31536000, immutable");
            return new WebResourceResponse("image/jpeg", null, 200, "OK", headers, new FileInputStream(file));
        } catch (IOException e) {
            return status(404, "Not Found");
        }
    }

    /**
     * A video's poster frame or a song's cover art as a cached JPEG, or null
     * when there is none. Also used for the lock-screen picture.
     */
    static File cachedImage(Context context, boolean audio, long id, String version, String albumId) {
        File dir = new File(context.getCacheDir(), audio ? "art" : "thumbs");
        String name = id + "_" + (version == null ? "0" : version.replaceAll("\\D", ""));
        File file = new File(dir, name + ".jpg");
        if (file.exists()) return file;
        File none = new File(dir, name + ".none");
        if (none.exists()) return null;
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();

        ContentResolver resolver = context.getContentResolver();
        Uri uri = ContentUris.withAppendedId(
            audio ? MediaStore.Audio.Media.EXTERNAL_CONTENT_URI : MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            id
        );
        Bitmap bmp = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                bmp = resolver.loadThumbnail(uri, new Size(512, 512), null);
            } else if (audio) {
                if (albumId != null) {
                    Uri art = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), Long.parseLong(albumId));
                    try (InputStream in = resolver.openInputStream(art)) {
                        if (in != null) bmp = BitmapFactory.decodeStream(in);
                    }
                }
            } else {
                bmp = MediaStore.Video.Thumbnails.getThumbnail(resolver, id, MediaStore.Video.Thumbnails.MINI_KIND, null);
            }
        } catch (Exception ignored) {
            // No embedded art, or an unreadable file: the page shows a plain tile.
        }
        if (bmp == null) {
            try {
                //noinspection ResultOfMethodCallIgnored
                none.createNewFile();
            } catch (IOException ignored) {}
            return null;
        }
        File tmp = new File(dir, name + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            bmp.compress(Bitmap.CompressFormat.JPEG, 82, out);
        } catch (IOException e) {
            return null;
        } finally {
            bmp.recycle();
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(file);
        return file.exists() ? file : null;
    }

    private static String header(WebResourceRequest request, String name) {
        for (Map.Entry<String, String> e : request.getRequestHeaders().entrySet()) {
            if (name.equalsIgnoreCase(e.getKey())) return e.getValue();
        }
        return null;
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    private static void closeQuietly(java.io.Closeable c) {
        try {
            c.close();
        } catch (IOException ignored) {}
    }

    /** Reports the bytes left from a known size, since WebView sizes and seeks by available(). */
    private static final class SizedStream extends InputStream {

        private final InputStream in;
        private long left;

        SizedStream(InputStream in, long size) {
            this.in = in;
            this.left = size;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = in.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = in.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long s = in.skip(Math.min(n, left));
            if (s > 0) left -= s;
            return s;
        }

        @Override
        public int available() {
            return (int) Math.min(left, Integer.MAX_VALUE);
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }
}
