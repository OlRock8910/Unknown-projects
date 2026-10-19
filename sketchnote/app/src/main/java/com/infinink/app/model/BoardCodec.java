package com.infinink.app.model;

import java.io.DataInput;
import java.io.DataOutput;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * The board file format: a small binary layout, because a busy board has hundreds of thousands
 * of coordinates and JSON would be slow and big. Newer files add fields at the end of a version;
 * readers refuse versions they do not know rather than guess.
 */
public final class BoardCodec {
    private static final int MAGIC = 0x494E4B42; // "INKB"
    /** 2 added a picture's angle; 3 a note's font and formatting. */
    public static final int VERSION = 3;

    private static final int T_STROKE = 1, T_NOTE = 2, T_PICTURE = 3;

    private BoardCodec() {}

    /** What the board list needs, without reading the whole file. */
    public static final class Header {
        public String id, name;
        public long created, modified;
        public int paper, pattern, itemCount;
        public int version;
    }

    public static void write(Board b, DataOutput out) throws IOException {
        writeHeader(b, out);
        out.writeFloat(b.viewX);
        out.writeFloat(b.viewY);
        out.writeFloat(b.viewScale);
        for (Item it : b.items) {
            if (it instanceof Stroke) {
                Stroke s = (Stroke) it;
                out.writeByte(T_STROKE);
                out.writeByte(s.brush);
                out.writeInt(s.color);
                out.writeFloat(s.size);
                out.writeInt(s.flags);
                out.writeInt(s.pts.length);
                for (float f : s.pts) out.writeFloat(f);
            } else if (it instanceof Note) {
                Note n = (Note) it;
                out.writeByte(T_NOTE);
                out.writeByte(n.style);
                out.writeFloat(n.x);
                out.writeFloat(n.y);
                out.writeFloat(n.w);
                out.writeFloat(n.h);
                out.writeFloat(n.fontSize);
                out.writeInt(n.paper);
                out.writeInt(n.ink);
                writeString(out, n.text);
                writeString(out, n.font);
                out.writeInt(n.fmt);
            } else if (it instanceof Picture) {
                Picture p = (Picture) it;
                out.writeByte(T_PICTURE);
                writeString(out, p.file);
                out.writeFloat(p.x);
                out.writeFloat(p.y);
                out.writeFloat(p.w);
                out.writeFloat(p.h);
                out.writeFloat(p.angle);
            }
        }
        out.writeByte(0);
    }

    private static void writeHeader(Board b, DataOutput out) throws IOException {
        out.writeInt(MAGIC);
        out.writeInt(VERSION);
        writeString(out, b.id);
        writeString(out, b.name);
        out.writeLong(b.created);
        out.writeLong(b.modified);
        out.writeInt(b.paper);
        out.writeInt(b.pattern);
        out.writeInt(b.items.size());
    }

    public static Header readHeader(DataInput in) throws IOException {
        if (in.readInt() != MAGIC) throw new IOException("not a board file");
        int version = in.readInt();
        if (version < 1 || version > VERSION) throw new IOException("board file version " + version + " is too new");
        Header h = new Header();
        h.version = version;
        h.id = readString(in);
        h.name = readString(in);
        h.created = in.readLong();
        h.modified = in.readLong();
        h.paper = in.readInt();
        h.pattern = in.readInt();
        h.itemCount = in.readInt();
        return h;
    }

    public static Board read(DataInput in) throws IOException {
        Header h = readHeader(in);
        Board b = new Board(h.id, h.name);
        b.created = h.created;
        b.modified = h.modified;
        b.paper = h.paper;
        b.pattern = h.pattern;
        b.viewX = in.readFloat();
        b.viewY = in.readFloat();
        b.viewScale = in.readFloat();
        if (!(b.viewScale > 0)) b.viewScale = 1f;
        b.items.ensureCapacity(h.itemCount);
        while (true) {
            int type = in.readByte();
            if (type == 0) break;
            switch (type) {
                case T_STROKE: {
                    int brush = in.readByte();
                    int color = in.readInt();
                    float size = in.readFloat();
                    int flags = in.readInt();
                    int len = in.readInt();
                    if (len < 3 || len % 3 != 0 || len > 30_000_000) throw new IOException("bad stroke");
                    float[] pts = new float[len];
                    for (int i = 0; i < len; i++) pts[i] = in.readFloat();
                    b.items.add(new Stroke(brush, color, size, flags, pts));
                    break;
                }
                case T_NOTE: {
                    int style = in.readByte();
                    float x = in.readFloat(), y = in.readFloat(), w = in.readFloat(), hh = in.readFloat();
                    float fs = in.readFloat();
                    int paper = in.readInt(), ink = in.readInt();
                    String text = readString(in);
                    String font = h.version >= 3 ? readString(in) : "";
                    int fmt = h.version >= 3 ? in.readInt() : 0;
                    b.items.add(new Note(style, x, y, w, hh, fs, paper, ink, text, font, fmt));
                    break;
                }
                case T_PICTURE: {
                    String file = readString(in);
                    float x = in.readFloat(), y = in.readFloat(), w = in.readFloat(), hh = in.readFloat();
                    float angle = h.version >= 2 ? in.readFloat() : 0f;
                    b.items.add(new Picture(file, x, y, w, hh, angle));
                    break;
                }
                default:
                    throw new IOException("unknown item type " + type);
            }
        }
        return b;
    }

    // writeUTF caps strings at 64 KB; a long note can be bigger than that.
    private static void writeString(DataOutput out, String s) throws IOException {
        byte[] bytes = (s == null ? "" : s).getBytes(StandardCharsets.UTF_8);
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private static String readString(DataInput in) throws IOException {
        int len = in.readInt();
        if (len < 0 || len > 50_000_000) throw new IOException("bad string");
        byte[] bytes = new byte[len];
        in.readFully(bytes);
        return new String(bytes, StandardCharsets.UTF_8);
    }
}
