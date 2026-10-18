package com.infinink.app.render;

import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.RectF;
import android.graphics.Shader;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;

import com.infinink.app.ink.StrokeOutline;
import com.infinink.app.model.Box;
import com.infinink.app.model.Brush;
import com.infinink.app.model.Item;
import com.infinink.app.model.Note;
import com.infinink.app.model.Picture;
import com.infinink.app.model.Stroke;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Draws board items onto a canvas already set up in board coordinates. Paths and text layouts
 * are cached on the items (main thread only); pass cache=false for drawing from elsewhere.
 */
public final class InkRenderer {
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint pencil = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint card = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint image = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final TextPaint text = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final BitmapShader grain;
    private final Matrix grainMatrix = new Matrix();
    private final Map<Integer, ColorFilter> tints = new HashMap<>();
    private final StrokeOutline.Outline outline = new StrokeOutline.Outline();
    private final RectF rect = new RectF();
    private final ImageCache images;
    private final boolean cache;
    private float viewScale = 1f;

    public InkRenderer(ImageCache images, boolean cache) {
        this.images = images;
        this.cache = cache;
        fill.setStyle(Paint.Style.FILL);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeJoin(Paint.Join.ROUND);
        pencil.setStyle(Paint.Style.FILL);
        grain = new BitmapShader(makeGrain(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
        pencil.setShader(grain);
    }

    /** The zoom the drawing will be seen at, so pencil grain stays a sensible size on screen. */
    public void setViewScale(float s) {
        viewScale = s;
        float k = 1f / Math.max(0.05f, s);
        grainMatrix.setScale(k, k);
        grain.setLocalMatrix(grainMatrix);
    }

    public void drawAll(Canvas c, List<Item> items, Box visible) {
        for (int i = 0, n = items.size(); i < n; i++) {
            Item it = items.get(i);
            if (visible == null || it.bounds().intersects(visible)) draw(c, it);
        }
    }

    public void draw(Canvas c, Item it) {
        if (it instanceof Stroke) drawStroke(c, (Stroke) it);
        else if (it instanceof Note) drawNote(c, (Note) it);
        else if (it instanceof Picture) drawPicture(c, (Picture) it);
    }

    // ---- strokes ------------------------------------------------------------------------------

    private static final class StrokeCache {
        Path path;
        Path head;
    }

    public void drawStroke(Canvas c, Stroke s) {
        StrokeCache sc = cache && s.cache instanceof StrokeCache ? (StrokeCache) s.cache : null;
        if (sc == null) {
            sc = new StrokeCache();
            sc.path = buildPath(s, new Path());
            if (s.has(Stroke.ARROW)) sc.head = arrowHead(s);
            if (cache) s.cache = sc;
        }
        paint(c, s.brush, s.color, s.size, s.flags, sc.path, sc.head);
    }

    /** Draws a stroke that is still being drawn (no caching; the path object is reused). */
    public void drawLive(Canvas c, int brush, int color, float size, int flags, float[] pts, int n, Path scratch) {
        if (n <= 0) return;
        scratch.rewind();
        buildPath(brush, size, flags, pts, n, scratch);
        Path head = null;
        if ((flags & Stroke.ARROW) != 0 && n >= 2) head = arrowHead(pts, n, size);
        paint(c, brush, color, size, flags, scratch, head);
    }

    private void paint(Canvas c, int brush, int color, float size, int flags, Path path, Path head) {
        boolean stroked = Brush.isUniform(brush) || (flags & Stroke.GEOMETRY) != 0;
        if ((flags & Stroke.FILL) != 0) {
            fill.setColor(tintFill(color));
            Path.FillType old = path.getFillType();
            path.setFillType(Path.FillType.WINDING);
            c.drawPath(path, fill);
            path.setFillType(old);
        }
        Paint p;
        if (brush == Brush.PENCIL) {
            p = pencil;
            p.setColorFilter(tint(color));
            p.setStyle(stroked ? Paint.Style.STROKE : Paint.Style.FILL);
            p.setStrokeWidth(size);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
        } else if (stroked) {
            p = line;
            p.setColor(color);
            p.setStrokeWidth(size);
            p.setStrokeCap(brush == Brush.HIGHLIGHTER && (flags & Stroke.GEOMETRY) == 0 ? Paint.Cap.SQUARE : Paint.Cap.ROUND);
        } else {
            p = fill;
            p.setColor(color);
        }
        c.drawPath(path, p);
        if (head != null) {
            line.setColor(color);
            line.setStrokeWidth(size);
            line.setStrokeCap(Paint.Cap.ROUND);
            c.drawPath(head, line);
        }
        if (p == pencil) p.setColorFilter(null);
    }

    private Path buildPath(Stroke s, Path out) {
        return buildPath(s.brush, s.size, s.flags, s.pts, s.count(), out);
    }

    private Path buildPath(int brush, float size, int flags, float[] pts, int n, Path out) {
        if ((flags & Stroke.GEOMETRY) != 0) {
            out.moveTo(pts[0], pts[1]);
            if (n == 1) out.lineTo(pts[0] + 0.01f, pts[1]);
            for (int i = 1; i < n; i++) out.lineTo(pts[3 * i], pts[3 * i + 1]);
            if ((flags & Stroke.CLOSED) != 0) out.close();
            return out;
        }
        if (Brush.isUniform(brush)) {
            smoothCenterline(pts, n, out);
            return out;
        }
        StrokeOutline.Params prm = StrokeOutline.forBrush(brush, size, (flags & Stroke.REAL_PRESSURE) != 0);
        StrokeOutline.build(pts, n, prm, outline);
        out.setFillType(Path.FillType.WINDING);
        float area = smoothPolygon(outline.poly.raw(), outline.poly.size() / 2, out);
        Path.Direction dir = area >= 0 ? Path.Direction.CW : Path.Direction.CCW;
        float[] cs = outline.circles.raw();
        for (int i = 0; i < outline.circles.size(); i += 3) out.addCircle(cs[i], cs[i + 1], cs[i + 2], dir);
        float[] q = outline.quads.raw();
        for (int i = 0; i < outline.quads.size(); i += 8) {
            out.moveTo(q[i], q[i + 1]);
            out.lineTo(q[i + 2], q[i + 3]);
            out.lineTo(q[i + 4], q[i + 5]);
            out.lineTo(q[i + 6], q[i + 7]);
            out.close();
        }
        return out;
    }

    /** A closed curve through the midpoints of the polygon's edges. Returns its signed area. */
    private static float smoothPolygon(float[] p, int n, Path out) {
        if (n < 3) return 0;
        float area = 0;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            area += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
        }
        out.moveTo((p[0] + p[2]) / 2, (p[1] + p[3]) / 2);
        for (int i = 1; i <= n; i++) {
            int a = i % n, b = (i + 1) % n;
            out.quadTo(p[2 * a], p[2 * a + 1], (p[2 * a] + p[2 * b]) / 2, (p[2 * a + 1] + p[2 * b + 1]) / 2);
        }
        out.close();
        return area;
    }

    private static void smoothCenterline(float[] p, int n, Path out) {
        out.moveTo(p[0], p[1]);
        if (n == 1) {
            out.lineTo(p[0] + 0.01f, p[1]);
            return;
        }
        for (int i = 1; i < n - 1; i++) {
            out.quadTo(p[3 * i], p[3 * i + 1], (p[3 * i] + p[3 * i + 3]) / 2, (p[3 * i + 1] + p[3 * i + 4]) / 2);
        }
        out.lineTo(p[3 * n - 3], p[3 * n - 2]);
    }

    private static Path arrowHead(Stroke s) {
        return arrowHead(s.pts, s.count(), s.size);
    }

    private static Path arrowHead(float[] p, int n, float size) {
        float ex = p[3 * n - 3], ey = p[3 * n - 2];
        // Point the head along the last stretch that is long enough to have a direction.
        int k = n - 2;
        float len = Math.max(size * 4.5f, size + 10f);
        while (k > 0 && Math.hypot(ex - p[3 * k], ey - p[3 * k + 1]) < len * 0.5f) k--;
        double a = Math.atan2(ey - p[3 * k + 1], ex - p[3 * k]);
        double spread = Math.toRadians(28);
        Path h = new Path();
        h.moveTo(ex - len * (float) Math.cos(a - spread), ey - len * (float) Math.sin(a - spread));
        h.lineTo(ex, ey);
        h.lineTo(ex - len * (float) Math.cos(a + spread), ey - len * (float) Math.sin(a + spread));
        return h;
    }

    private ColorFilter tint(int color) {
        ColorFilter f = tints.get(color);
        if (f == null) {
            f = new PorterDuffColorFilter(color, PorterDuff.Mode.SRC_IN);
            if (tints.size() > 64) tints.clear();
            tints.put(color, f);
        }
        return f;
    }

    private static int tintFill(int color) {
        int a = Math.round(Color.alpha(color) * 0.22f);
        return (a << 24) | (color & 0x00FFFFFF);
    }

    /** A paper-tooth texture: mostly ink with scattered lighter specks, tiled. */
    private static Bitmap makeGrain() {
        int size = 96;
        int[] px = new int[size * size];
        Random r = new Random(42);
        for (int i = 0; i < px.length; i++) {
            float v = r.nextFloat();
            int a = v < 0.18f ? 70 + r.nextInt(60) : v < 0.45f ? 170 + r.nextInt(40) : 225 + r.nextInt(31);
            px[i] = (a << 24) | 0xFFFFFF;
        }
        return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888);
    }

    // ---- notes --------------------------------------------------------------------------------

    private static final class NoteCache {
        StaticLayout layout;
    }

    public static float notePadding(Note n) {
        return n.style == Note.STICKY ? n.fontSize * 0.85f : 0;
    }

    /**
     * Text is laid out at this size and scaled to the note's real size when drawn, so line breaks
     * are the same whatever the zoom was when the note was written (tiny font sizes lay out badly).
     */
    private static final float LAYOUT_SIZE = 40f;

    private StaticLayout layoutFor(Note n, TextPaint tp) {
        float pad = notePadding(n);
        float k = LAYOUT_SIZE / n.fontSize;
        int width = Math.max(1, (int) Math.floor((n.w - 2 * pad) * k));
        tp.setTextSize(LAYOUT_SIZE);
        tp.setColor(n.ink);
        String t = n.text.isEmpty() ? " " : n.text;
        return StaticLayout.Builder.obtain(t, 0, t.length(), tp, width)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                .setLineSpacing(0, 1.12f)
                .setIncludePad(false)
                .build();
    }

    /** Height a note needs for its text at its width. */
    public float measureNoteHeight(Note n) {
        StaticLayout l = layoutFor(n, new TextPaint(text));
        float h = l.getHeight() * n.fontSize / LAYOUT_SIZE + 2 * notePadding(n);
        if (n.style == Note.STICKY) h = Math.max(h, n.w * 0.62f);
        return h;
    }

    public void drawNote(Canvas c, Note n) {
        NoteCache nc = cache && n.cache instanceof NoteCache ? (NoteCache) n.cache : null;
        if (nc == null) {
            nc = new NoteCache();
            nc.layout = layoutFor(n, new TextPaint(text));
            if (cache) n.cache = nc;
        }
        if (n.style == Note.STICKY) {
            float r = n.w * 0.035f;
            float lift = n.w * 0.018f;
            card.setColor(0x26000000);
            rect.set(n.x + lift * 0.4f, n.y + lift, n.x + n.w + lift * 0.4f, n.y + n.h + lift * 1.6f);
            c.drawRoundRect(rect, r, r, card);
            card.setColor(n.paper);
            rect.set(n.x, n.y, n.x + n.w, n.y + n.h);
            c.drawRoundRect(rect, r, r, card);
            // A slightly darker band at the top, like the glue strip of a real sticky note.
            card.setColor(0x14000000);
            rect.set(n.x, n.y, n.x + n.w, n.y + Math.min(n.h, n.fontSize * 0.55f));
            c.save();
            c.clipRect(rect);
            rect.set(n.x, n.y, n.x + n.w, n.y + n.h);
            c.drawRoundRect(rect, r, r, card);
            c.restore();
        }
        float pad = notePadding(n);
        c.save();
        c.translate(n.x + pad, n.y + pad);
        float k = n.fontSize / LAYOUT_SIZE;
        c.scale(k, k);
        nc.layout.getPaint().setColor(n.ink);
        nc.layout.draw(c);
        c.restore();
    }

    // ---- pictures -----------------------------------------------------------------------------

    public void drawPicture(Canvas c, Picture p) {
        Bitmap b = cache ? images.get(p.file) : images.getNow(p.file);
        rect.set(p.x, p.y, p.x + p.w, p.y + p.h);
        if (b == null) {
            card.setColor(0x22808080);
            c.drawRect(rect, card);
            return;
        }
        c.drawBitmap(b, null, rect, image);
    }

    public float viewScale() {
        return viewScale;
    }
}
