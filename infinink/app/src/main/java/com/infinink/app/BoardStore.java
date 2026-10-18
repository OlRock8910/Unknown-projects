package com.infinink.app;

import android.content.Context;
import android.graphics.Bitmap;

import com.infinink.app.model.Board;
import com.infinink.app.model.BoardCodec;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Boards on disk, all private to the app:
 *   files/boards/<id>.ink        the board
 *   files/boards/<id>.jpg        its thumbnail for the board list
 *   files/boards/<id>/           pictures placed on it
 */
public final class BoardStore {
    private final File dir;

    public BoardStore(Context c) {
        dir = new File(c.getFilesDir(), "boards");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    public static String newId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    public File boardFile(String id) {
        return new File(dir, id + ".ink");
    }

    public File thumbFile(String id) {
        return new File(dir, id + ".jpg");
    }

    public File imageDir(String id) {
        File d = new File(dir, id);
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    /** All boards, most recently changed first. Unreadable files are skipped. */
    public List<BoardCodec.Header> list() {
        List<BoardCodec.Header> out = new ArrayList<>();
        File[] files = dir.listFiles();
        if (files == null) return out;
        for (File f : files) {
            if (!f.getName().endsWith(".ink")) continue;
            try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(f), 512))) {
                out.add(BoardCodec.readHeader(in));
            } catch (IOException ignored) {
                // A half-written or foreign file: leave it alone.
            }
        }
        Collections.sort(out, new Comparator<BoardCodec.Header>() {
            @Override
            public int compare(BoardCodec.Header a, BoardCodec.Header b) {
                return Long.compare(b.modified, a.modified);
            }
        });
        return out;
    }

    public Board load(String id) throws IOException {
        try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(boardFile(id)), 1 << 16))) {
            return BoardCodec.read(in);
        }
    }

    /**
     * Writes the board safely: to a temporary file first, then renamed over the old one, so a
     * crash or a full disk mid-save never leaves a broken board behind.
     */
    public void save(Board b) throws IOException {
        File target = boardFile(b.id);
        File tmp = new File(dir, b.id + ".ink.tmp");
        try (FileOutputStream fos = new FileOutputStream(tmp);
             DataOutputStream out = new DataOutputStream(new BufferedOutputStream(fos, 1 << 16))) {
            BoardCodec.write(b, out);
            out.flush();
            fos.getFD().sync();
        }
        if (!tmp.renameTo(target)) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            if (!tmp.renameTo(target)) throw new IOException("could not save board");
        }
    }

    public void saveThumb(String id, Bitmap thumb) {
        File tmp = new File(dir, id + ".jpg.tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            thumb.compress(Bitmap.CompressFormat.JPEG, 86, out);
        } catch (IOException e) {
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(thumbFile(id));
    }

    public void delete(String id) {
        //noinspection ResultOfMethodCallIgnored
        boardFile(id).delete();
        //noinspection ResultOfMethodCallIgnored
        thumbFile(id).delete();
        deleteTree(new File(dir, id));
    }

    public Board duplicate(String id, String newName) throws IOException {
        Board src = load(id);
        Board copy = new Board(newId(), newName);
        copy.paper = src.paper;
        copy.pattern = src.pattern;
        copy.viewX = src.viewX;
        copy.viewY = src.viewY;
        copy.viewScale = src.viewScale;
        copy.items.addAll(src.items);
        File from = new File(dir, id);
        File[] pics = from.listFiles();
        if (pics != null) {
            File to = imageDir(copy.id);
            for (File f : pics) copyFile(f, new File(to, f.getName()));
        }
        save(copy);
        if (thumbFile(id).exists()) copyFile(thumbFile(id), thumbFile(copy.id));
        return copy;
    }

    public void rename(String id, String name) throws IOException {
        Board b = load(id);
        b.name = name;
        save(b);
    }

    static void copyFile(File from, File to) throws IOException {
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
