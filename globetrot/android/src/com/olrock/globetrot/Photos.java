package com.olrock.globetrot;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import android.webkit.WebResourceResponse;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

/**
 * The phone's photos, for the map. Finds every photo with a location in the
 * gallery, and serves pictures to the WebView at https://globetrot.local/:
 *   g/<id>?s=<px>   a gallery photo, scaled to fit <px>
 *   a/<name>.jpg    a photo the user added, kept in the app's files
 * Photos are only ever read; nothing is uploaded or changed.
 *
 * The app compiles against API 23, so the newer calls (reading original
 * photos with their location on Android 10+, system thumbnails) go through
 * reflection.
 */
final class Photos {
    static final String HOST = "globetrot.local";

    interface Progress {
        void update(int done, int total);
    }

    private final Context ctx;
    private final File added;
    private final File thumbs;
    private final File cacheFile;
    int lastTotal;

    Photos(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        added = new File(ctx.getFilesDir(), "photos");
        thumbs = new File(ctx.getCacheDir(), "thumbs");
        cacheFile = new File(ctx.getFilesDir(), "photo-locations.txt");
    }

    // ------------------------------------------------------------ scanning

    /** JSON [[id, lat, lon, takenMs], …] for every photo that has a location. */
    String scan(Progress progress) {
        ContentResolver cr = ctx.getContentResolver();
        Uri base = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        // Before Android 10 the gallery index has the location; from 10 on it's
        // blanked and has to be read from each photo (cached between scans).
        boolean readFiles = Build.VERSION.SDK_INT >= 29;
        String[] cols = readFiles
                ? new String[] { MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_MODIFIED, MediaStore.Images.Media.SIZE }
                : new String[] { MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_MODIFIED, MediaStore.Images.Media.LATITUDE, MediaStore.Images.Media.LONGITUDE };
        Map<Long, String> cache = readFiles ? readCache() : new HashMap<Long, String>();
        Map<Long, String> fresh = new HashMap<Long, String>();
        StringBuilder out = new StringBuilder("[");
        Cursor c = null;
        try {
            c = cr.query(base, cols, null, null, MediaStore.Images.Media.DATE_TAKEN + " DESC");
        } catch (Exception e) {
            // no permission
        }
        if (c == null) return "[]";
        int total = c.getCount(), done = 0, found = 0;
        lastTotal = total;
        try {
            while (c.moveToNext()) {
                long id = c.getLong(0);
                long taken = c.getLong(1);
                long modified = c.getLong(2);
                if (taken <= 0) taken = modified * 1000;
                double lat = Double.NaN, lon = Double.NaN;
                if (readFiles) {
                    String key = modified + ":" + c.getLong(3);
                    String hit = cache.get(id);
                    String loc;
                    if (hit != null && hit.startsWith(key + ";")) {
                        loc = hit.substring(key.length() + 1);
                    } else {
                        loc = readLocation(cr, ContentUris.withAppendedId(base, id));
                    }
                    if (loc != null) {
                        fresh.put(id, key + ";" + loc);
                        int comma = loc.indexOf(',');
                        if (comma > 0) {
                            lat = Double.parseDouble(loc.substring(0, comma));
                            lon = Double.parseDouble(loc.substring(comma + 1));
                        }
                    }
                } else if (!c.isNull(3) && !c.isNull(4)) {
                    lat = c.getDouble(3);
                    lon = c.getDouble(4);
                }
                if (!Double.isNaN(lat) && !Double.isNaN(lon) && (lat != 0 || lon != 0)
                        && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                    if (found++ > 0) out.append(',');
                    out.append('[').append(id).append(',').append(lat).append(',').append(lon).append(',').append(taken).append(']');
                }
                if (++done % 40 == 0) progress.update(done, total);
            }
        } finally {
            c.close();
        }
        if (readFiles) writeCache(fresh);
        return out.append(']').toString();
    }

    /** "lat,lon", "" when the photo has no location, or null if it couldn't be read. */
    private String readLocation(ContentResolver cr, Uri uri) {
        InputStream in = null;
        try {
            try {
                in = cr.openInputStream(original(uri));
            } catch (Exception e) {
                // Without the media-location permission Android refuses the original (and
                // the plain photo has its location removed). Not cached: try again next scan.
                return null;
            }
            if (in == null) return null;
            Object exif = exifFromStream().newInstance(new BufferedInputStream(in, 64 * 1024));
            float[] ll = new float[2];
            if (((ExifInterface) exif).getLatLong(ll)) return ll[0] + "," + ll[1];
            return "";
        } catch (Throwable e) {
            return null;
        } finally {
            if (in != null) try { in.close(); } catch (Exception ignored) { }
        }
    }

    private static Method requireOriginal;
    private static Constructor<?> exifCtor;
    private static Method loadThumbnail;

    /** MediaStore.setRequireOriginal(uri), API 29: the photo with its location left in. */
    private static Uri original(Uri uri) {
        try {
            if (requireOriginal == null) requireOriginal = MediaStore.class.getMethod("setRequireOriginal", Uri.class);
            return (Uri) requireOriginal.invoke(null, uri);
        } catch (Exception e) {
            return uri;
        }
    }

    /** new ExifInterface(InputStream), API 24. */
    private static Constructor<?> exifFromStream() throws Exception {
        if (exifCtor == null) exifCtor = ExifInterface.class.getConstructor(InputStream.class);
        return exifCtor;
    }

    private Map<Long, String> readCache() {
        Map<Long, String> m = new HashMap<Long, String>();
        try {
            BufferedReader r = new BufferedReader(new FileReader(cacheFile));
            try {
                String line;
                while ((line = r.readLine()) != null) {
                    int sp = line.indexOf(' ');
                    if (sp > 0) m.put(Long.parseLong(line.substring(0, sp)), line.substring(sp + 1));
                }
            } finally {
                r.close();
            }
        } catch (Exception e) {
            // first scan
        }
        return m;
    }

    private void writeCache(Map<Long, String> m) {
        try {
            File tmp = new File(cacheFile.getPath() + ".tmp");
            FileWriter w = new FileWriter(tmp);
            try {
                for (Map.Entry<Long, String> e : m.entrySet()) w.write(e.getKey() + " " + e.getValue() + "\n");
            } finally {
                w.close();
            }
            tmp.renameTo(cacheFile);
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------ added photos

    private static boolean goodName(String name) {
        return name != null && name.matches("[A-Za-z0-9-]{1,40}\\.jpg");
    }

    boolean save(String name, String base64) {
        if (!goodName(name)) return false;
        try {
            added.mkdirs();
            FileOutputStream out = new FileOutputStream(new File(added, name));
            try {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            } finally {
                out.close();
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    void delete(String name) {
        if (goodName(name)) new File(added, name).delete();
    }

    // ------------------------------------------------------------ serving pictures

    WebResourceResponse serve(Uri url) {
        try {
            java.util.List<String> seg = url.getPathSegments();
            if (seg.size() == 2 && "a".equals(seg.get(0)) && goodName(seg.get(1))) {
                File f = new File(added, seg.get(1));
                if (f.isFile()) return jpeg(new BufferedInputStream(new FileInputStream(f)));
            } else if (seg.size() == 2 && "g".equals(seg.get(0))) {
                long id = Long.parseLong(seg.get(1));
                String s = url.getQueryParameter("s");
                int size = Math.max(64, Math.min(2048, s == null ? 320 : Integer.parseInt(s)));
                byte[] data = gallery(id, size);
                if (data != null) return jpeg(new ByteArrayInputStream(data));
            }
        } catch (Exception e) {
            // fall through to 404
        }
        Map<String, String> h = new HashMap<String, String>();
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
    }

    private static WebResourceResponse jpeg(InputStream in) {
        Map<String, String> h = new HashMap<String, String>();
        h.put("Cache-Control", "max-age=86400");
        return new WebResourceResponse("image/jpeg", null, 200, "OK", h, in);
    }

    /** A gallery photo as a JPEG no bigger than size×size, upright. Small ones are cached. */
    private byte[] gallery(long id, int size) throws Exception {
        boolean small = size <= 512;
        File cached = new File(thumbs, id + "_" + size + ".jpg");
        if (small && cached.isFile()) return readAll(new FileInputStream(cached));
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        Bitmap b = null;
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                if (loadThumbnail == null) {
                    loadThumbnail = ContentResolver.class.getMethod("loadThumbnail", Uri.class, Size.class, android.os.CancellationSignal.class);
                }
                b = (Bitmap) loadThumbnail.invoke(ctx.getContentResolver(), uri, new Size(size, size), null);
            } catch (Exception e) {
                b = null;
            }
        }
        if (b == null) b = decode(uri, size);
        if (b == null) return null;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, small ? 82 : 88, bytes);
        b.recycle();
        byte[] data = bytes.toByteArray();
        if (small) {
            try {
                thumbs.mkdirs();
                FileOutputStream out = new FileOutputStream(cached);
                try { out.write(data); } finally { out.close(); }
            } catch (Exception ignored) {
            }
        }
        return data;
    }

    /** Decodes at roughly the size needed and turns it the right way up. */
    private Bitmap decode(Uri uri, int size) throws Exception {
        ContentResolver cr = ctx.getContentResolver();
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        InputStream in = cr.openInputStream(uri);
        try { BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
        if (o.outWidth <= 0) return null;
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= size) sample *= 2;
        o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        in = cr.openInputStream(uri);
        Bitmap b;
        try { b = BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
        if (b == null) return null;
        float f = Math.min(1f, (float) size / Math.max(b.getWidth(), b.getHeight()));
        int turn = orientation(cr, uri);
        if (f < 1f || turn != 0) {
            Matrix m = new Matrix();
            m.postScale(f, f);
            m.postRotate(turn);
            Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            if (r != b) b.recycle();
            b = r;
        }
        return b;
    }

    private static int orientation(ContentResolver cr, Uri uri) {
        Cursor c = null;
        try {
            c = cr.query(uri, new String[] { MediaStore.Images.ImageColumns.ORIENTATION }, null, null, null);
            if (c != null && c.moveToFirst()) return c.getInt(0);
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return 0;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }
}
