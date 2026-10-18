package com.infinink.app.render;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Decodes the pictures on a board off the main thread and keeps recent ones in memory. */
public final class ImageCache {
    public interface Listener {
        void onImageLoaded();
    }

    private final File dir;
    private final LruCache<String, Bitmap> cache;
    private final Set<String> loading = new HashSet<>();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Listener listener;

    public ImageCache(File dir) {
        this.dir = dir;
        int kb = (int) Math.min(Integer.MAX_VALUE, Runtime.getRuntime().maxMemory() / 1024 / 5);
        cache = new LruCache<String, Bitmap>(kb) {
            @Override
            protected int sizeOf(String key, Bitmap value) {
                return value.getAllocationByteCount() / 1024;
            }
        };
    }

    public File dir() {
        return dir;
    }

    public void setListener(Listener l) {
        listener = l;
    }

    /** The bitmap if it is ready; otherwise starts loading it and returns null. */
    public Bitmap get(final String file) {
        Bitmap b = cache.get(file);
        if (b != null || loading.contains(file)) return b;
        loading.add(file);
        worker.execute(new Runnable() {
            @Override
            public void run() {
                final Bitmap decoded = decode(file);
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        loading.remove(file);
                        if (decoded != null) cache.put(file, decoded);
                        if (listener != null) listener.onImageLoaded();
                    }
                });
            }
        });
        return null;
    }

    /** For exports, which need every picture now. */
    public Bitmap getNow(String file) {
        Bitmap b = cache.get(file);
        if (b == null) {
            b = decode(file);
            if (b != null) cache.put(file, b);
        }
        return b;
    }

    private Bitmap decode(String file) {
        try {
            return BitmapFactory.decodeFile(new File(dir, file).getAbsolutePath());
        } catch (OutOfMemoryError e) {
            return null;
        }
    }

    public void shutdown() {
        worker.shutdown();
        listener = null;
    }
}
