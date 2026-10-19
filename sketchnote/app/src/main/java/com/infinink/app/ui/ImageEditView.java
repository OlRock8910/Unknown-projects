package com.infinink.app.ui;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;

import com.infinink.app.img.ImageOps;

import java.util.ArrayDeque;
import java.util.Locale;

/**
 * The picture being edited: crop frame, cut-out brushes, magic wand and the colour loupe.
 * One finger uses the current mode; two fingers zoom and move the picture for close work.
 */
public final class ImageEditView extends View {
    public interface Listener {
        /** A colour was picked with the loupe. */
        void onPicked(int rgb);

        /** The cut-out changed (for the undo button). */
        void onChanged();
    }

    public static final int CROP = 0, ERASE = 1, RESTORE = 2, WAND = 3, PICK = 4;

    private static final int H_LEFT = 1, H_TOP = 2, H_RIGHT = 4, H_BOTTOM = 8, H_MOVE = 16;
    private static final int UNDO_LIMIT = 12;

    private final float density;
    private int w, h;
    private int[] px;
    private byte[] mask;
    private Bitmap shown;
    private int[] rowBuf = new int[0];
    private final RectF crop = new RectF();
    private float aspect; // width / height, 0 = free
    private int mode = CROP;
    private float brushDp = 26f;
    private float tolerance = 0.35f;
    private final ArrayDeque<byte[]> undo = new ArrayDeque<>();
    private boolean maskEdited;
    private int turns; // quarter turns clockwise
    private boolean flipped;
    private Listener listener;

    // View transform: screen = image * scale + (tx, ty).
    private float fit = 1f, zoom = 1f, panX, panY;
    private float scale = 1f, tx, ty;

    // Gesture.
    private int gesture; // 0 none, 1 tool, 2 nav
    private int handle;
    private final RectF startCrop = new RectF();
    private float downX, downY, lastX, lastY;
    private float navFx, navFy, navSpan;
    private boolean touching;
    private int picked;

    private final Paint bmp = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint pixelated = new Paint();
    private final Paint checker = new Paint();
    private final Paint dim = new Paint();
    private final Paint frame = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Matrix matrix = new Matrix();
    private final RectF r = new RectF();
    private final Path clip = new Path();

    public ImageEditView(Context c) {
        super(c);
        density = getResources().getDisplayMetrics().density;
        int cell = Math.round(8 * density);
        Bitmap tile = Bitmap.createBitmap(cell * 2, cell * 2, Bitmap.Config.ARGB_8888);
        Canvas tc = new Canvas(tile);
        tc.drawColor(0xFF3A3B42);
        Paint p = new Paint();
        p.setColor(0xFF2A2B31);
        tc.drawRect(0, 0, cell, cell, p);
        tc.drawRect(cell, cell, 2 * cell, 2 * cell, p);
        checker.setShader(new BitmapShader(tile, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT));
        frame.setStyle(Paint.Style.STROKE);
        text.setColor(0xFFFFFFFF);
        text.setTextSize(13 * density);
        text.setTextAlign(Paint.Align.CENTER);
        text.setFakeBoldText(true);
        setContentDescription("Picture being edited");
    }

    public void setListener(Listener l) {
        listener = l;
    }

    /** Starts editing these pixels (ARGB, w x h). */
    public void setImage(int[] pixels, int width, int height) {
        px = pixels;
        w = width;
        h = height;
        mask = ImageOps.fullMask(w * h);
        crop.set(0, 0, w, h);
        undo.clear();
        maskEdited = false;
        turns = 0;
        flipped = false;
        rebuildShown();
        refit();
    }

    // ---- state for the activity -----------------------------------------------------------------

    public void setMode(int m) {
        mode = m;
        invalidate();
    }

    public int mode() {
        return mode;
    }

    public void setBrushDp(float dp) {
        brushDp = dp;
    }

    public void setTolerance(float t) {
        tolerance = t;
    }

    public float tolerance() {
        return tolerance;
    }

    public int width() {
        return w;
    }

    public int height() {
        return h;
    }

    public int[] pixels() {
        return px;
    }

    public byte[] mask() {
        return mask;
    }

    /** The crop in whole pixels: {left, top, width, height}. */
    public int[] cropRect() {
        int l = Math.max(0, Math.round(crop.left)), t = Math.max(0, Math.round(crop.top));
        int rr = Math.min(w, Math.round(crop.right)), b = Math.min(h, Math.round(crop.bottom));
        return new int[]{l, t, Math.max(1, rr - l), Math.max(1, b - t)};
    }

    public boolean turned() {
        return turns % 4 != 0 || flipped;
    }

    public boolean edited() {
        int[] c = cropRect();
        return maskEdited || turned() || c[0] != 0 || c[1] != 0 || c[2] != w || c[3] != h;
    }

    public boolean canUndo() {
        return !undo.isEmpty();
    }

    // ---- crop -----------------------------------------------------------------------------------

    /** Locks the crop to width/height = a (0 frees it), fitted as large as it goes. */
    public void setAspect(float a) {
        aspect = a;
        if (a > 0) {
            float cx = crop.centerX(), cy = crop.centerY();
            float cw = crop.width(), ch = cw / a;
            if (ch > crop.height()) {
                ch = crop.height();
                cw = ch * a;
            }
            if (cw > w) {
                cw = w;
                ch = cw / a;
            }
            if (ch > h) {
                ch = h;
                cw = ch * a;
            }
            crop.set(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2);
            keepCropInside();
        }
        invalidate();
    }

    public void resetCrop() {
        aspect = 0;
        crop.set(0, 0, w, h);
        invalidate();
    }

    /** Quarter turn clockwise. */
    public void rotate() {
        int[] np = ImageOps.rotate(px, w, h);
        byte[] nm = ImageOps.rotate(mask, w, h);
        RectF c = new RectF(h - crop.bottom, crop.left, h - crop.top, crop.right);
        ArrayDeque<byte[]> keep = new ArrayDeque<>();
        for (byte[] u : undo) keep.addLast(ImageOps.rotate(u, w, h));
        int ow = w;
        w = h;
        h = ow;
        px = np;
        mask = nm;
        crop.set(c);
        undo.clear();
        undo.addAll(keep);
        if (aspect > 0) aspect = 1f / aspect;
        turns++;
        rebuildShown();
        refit();
    }

    public void flip() {
        ImageOps.flip(px, w, h);
        ImageOps.flip(mask, w, h);
        for (byte[] u : undo) ImageOps.flip(u, w, h);
        crop.set(w - crop.right, crop.top, w - crop.left, crop.bottom);
        flipped = !flipped;
        rebuildShown();
        invalidate();
    }

    // ---- cut-out --------------------------------------------------------------------------------

    private void snapshot() {
        undo.push(mask.clone());
        while (undo.size() > UNDO_LIMIT) undo.removeLast();
    }

    /** Removes the background touching the edges. Returns false if nothing looked like one. */
    public boolean autoRemove() {
        snapshot();
        int n = ImageOps.removeBackground(px, w, h, tolerance, mask);
        if (n == 0) {
            undo.pop();
            return false;
        }
        changed(0, 0, w, h);
        return true;
    }

    public void undo() {
        if (undo.isEmpty()) return;
        mask = undo.pop();
        maskEdited = !undo.isEmpty() || anyCut();
        rebuildShown();
        invalidate();
        if (listener != null) listener.onChanged();
    }

    /** Brings every pixel back. */
    public void restoreAll() {
        snapshot();
        mask = ImageOps.fullMask(w * h);
        changed(0, 0, w, h);
    }

    private boolean anyCut() {
        for (byte b : mask) if (b != (byte) 255) return true;
        return false;
    }

    private void changed(int l, int t, int rr, int b) {
        maskEdited = true;
        refresh(l, t, rr, b);
        invalidate();
        if (listener != null) listener.onChanged();
    }

    // ---- drawing --------------------------------------------------------------------------------

    private void rebuildShown() {
        if (shown == null || shown.getWidth() != w || shown.getHeight() != h) {
            shown = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        }
        refresh(0, 0, w, h);
    }

    /** Recomputes the shown pixels in [l, r) x [t, b) from the picture and its mask. */
    private void refresh(int l, int t, int rr, int b) {
        int cw = rr - l;
        if (cw <= 0 || b <= t) return;
        if (rowBuf.length < cw) rowBuf = new int[cw];
        for (int y = t; y < b; y++) {
            int base = y * w;
            for (int x = 0; x < cw; x++) {
                int i = base + l + x;
                int a = ((px[i] >>> 24) * (mask[i] & 255)) / 255;
                rowBuf[x] = (a << 24) | (px[i] & 0x00FFFFFF);
            }
            shown.setPixels(rowBuf, 0, cw, l, y, cw, 1);
        }
    }

    private void refit() {
        if (getWidth() == 0 || w == 0) return;
        float pad = 18 * density;
        fit = Math.min((getWidth() - 2 * pad) / w, (getHeight() - 2 * pad) / h);
        zoom = 1f;
        panX = panY = 0;
        updateTransform();
        invalidate();
    }

    private void updateTransform() {
        scale = fit * zoom;
        tx = getWidth() / 2f - w / 2f * scale + panX;
        ty = getHeight() / 2f - h / 2f * scale + panY;
    }

    @Override
    protected void onSizeChanged(int nw, int nh, int ow, int oh) {
        refit();
    }

    private float sx(float ix) {
        return ix * scale + tx;
    }

    private float sy(float iy) {
        return iy * scale + ty;
    }

    private float ix(float vx) {
        return (vx - tx) / scale;
    }

    private float iy(float vy) {
        return (vy - ty) / scale;
    }

    @Override
    protected void onDraw(Canvas c) {
        c.drawColor(0xFF0E0F13);
        if (shown == null) return;
        r.set(sx(0), sy(0), sx(w), sy(h));
        c.drawRect(r, checker);
        matrix.setScale(scale, scale);
        matrix.postTranslate(tx, ty);
        // Zoomed right in, show crisp pixels rather than a blur.
        c.drawBitmap(shown, matrix, scale > 4 ? pixelated : bmp);

        // Darken what the crop will cut away.
        float cl = sx(crop.left), ct = sy(crop.top), cr = sx(crop.right), cb = sy(crop.bottom);
        dim.setColor(mode == CROP ? 0xB0000000 : 0x80000000);
        c.drawRect(r.left, r.top, r.right, ct, dim);
        c.drawRect(r.left, cb, r.right, r.bottom, dim);
        c.drawRect(r.left, ct, cl, cb, dim);
        c.drawRect(cr, ct, r.right, cb, dim);

        if (mode == CROP) {
            frame.setColor(0xFFFFFFFF);
            frame.setStrokeWidth(1.5f * density);
            c.drawRect(cl, ct, cr, cb, frame);
            frame.setColor(0x66FFFFFF);
            frame.setStrokeWidth(density);
            for (int i = 1; i <= 2; i++) {
                float x = cl + (cr - cl) * i / 3f, y = ct + (cb - ct) * i / 3f;
                c.drawLine(x, ct, x, cb, frame);
                c.drawLine(cl, y, cr, y, frame);
            }
            frame.setColor(0xFFFFFFFF);
            frame.setStrokeWidth(4 * density);
            frame.setStrokeCap(Paint.Cap.ROUND);
            float k = Math.min(22 * density, Math.min(cr - cl, cb - ct) / 3);
            corner(c, cl, ct, k, k);
            corner(c, cr, ct, -k, k);
            corner(c, cl, cb, k, -k);
            corner(c, cr, cb, -k, -k);
        }

        if (touching && gesture == 1 && (mode == ERASE || mode == RESTORE)) {
            frame.setStrokeWidth(1.5f * density);
            frame.setColor(mode == ERASE ? 0xFFFF8A8E : 0xFF7EE0A0);
            c.drawCircle(lastX, lastY, brushDp * density, frame);
        }
        if (touching && gesture == 1 && mode == PICK) drawLoupe(c);
    }

    private void corner(Canvas c, float x, float y, float dx, float dy) {
        c.drawLine(x, y, x + dx, y, frame);
        c.drawLine(x, y, x, y + dy, frame);
    }

    /** A magnifier above the finger showing the pixels under it and the colour picked. */
    private void drawLoupe(Canvas c) {
        float rad = 56 * density;
        float cx = lastX, cy = lastY - rad - 36 * density;
        if (cy - rad < 0) cy = lastY + rad + 36 * density;
        float mag = Math.max(8f, scale * 2f);
        c.save();
        clip.rewind();
        clip.addCircle(cx, cy, rad, Path.Direction.CW);
        c.clipPath(clip);
        c.drawColor(0xFF2A2B31);
        float ixp = ix(lastX), iyp = iy(lastY);
        matrix.setScale(mag, mag);
        matrix.postTranslate(cx - ixp * mag, cy - iyp * mag);
        c.drawBitmap(shown, matrix, pixelated);
        c.restore();
        frame.setStrokeWidth(5 * density);
        frame.setColor(picked);
        c.drawCircle(cx, cy, rad, frame);
        frame.setStrokeWidth(1.5f * density);
        frame.setColor(0xFFFFFFFF);
        c.drawCircle(cx, cy, rad + 2.5f * density, frame);
        c.drawLine(cx - 8 * density, cy, cx + 8 * density, cy, frame);
        c.drawLine(cx, cy - 8 * density, cx, cy + 8 * density, frame);
        String hex = String.format(Locale.US, "#%06X", picked & 0xFFFFFF);
        fill.setColor(0xCC000000);
        float tw = text.measureText(hex) / 2 + 10 * density;
        r.set(cx - tw, cy + rad + 8 * density, cx + tw, cy + rad + 32 * density);
        c.drawRoundRect(r, 12 * density, 12 * density, fill);
        c.drawText(hex, cx, r.bottom - 7 * density, text);
    }

    // ---- touch ----------------------------------------------------------------------------------

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (shown == null) return false;
        float x = e.getX(), y = e.getY();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                getParent().requestDisallowInterceptTouchEvent(true);
                downX = lastX = x;
                downY = lastY = y;
                touching = true;
                gesture = 1;
                startTool(x, y);
                invalidate();
                return true;
            case MotionEvent.ACTION_POINTER_DOWN:
                if (gesture == 1 && (mode == ERASE || mode == RESTORE) && !undo.isEmpty()) {
                    // That was the start of a pinch, not a brush stroke: put the mask back.
                    mask = undo.pop();
                    rebuildShown();
                }
                gesture = 2;
                beginNav(e);
                invalidate();
                return true;
            case MotionEvent.ACTION_MOVE:
                if (gesture == 2) nav(e);
                else if (gesture == 1) moveTool(x, y);
                lastX = x;
                lastY = y;
                invalidate();
                return true;
            case MotionEvent.ACTION_POINTER_UP:
                if (gesture == 2) {
                    beginNav(e, e.getActionIndex());
                }
                return true;
            case MotionEvent.ACTION_UP:
                if (gesture == 1) endTool(x, y);
                touching = false;
                gesture = 0;
                invalidate();
                return true;
            case MotionEvent.ACTION_CANCEL:
                touching = false;
                gesture = 0;
                invalidate();
                return true;
        }
        return super.onTouchEvent(e);
    }

    private void startTool(float x, float y) {
        switch (mode) {
            case CROP:
                handle = hitHandle(x, y);
                startCrop.set(crop);
                break;
            case ERASE:
            case RESTORE:
                snapshot();
                paint(x, y, x, y);
                break;
            case PICK:
                picked = pickAt(x, y);
                break;
        }
    }

    private void moveTool(float x, float y) {
        switch (mode) {
            case CROP:
                dragCrop((x - downX) / scale, (y - downY) / scale);
                break;
            case ERASE:
            case RESTORE:
                paint(lastX, lastY, x, y);
                break;
            case PICK:
                picked = pickAt(x, y);
                break;
        }
    }

    private void endTool(float x, float y) {
        if (mode == WAND && Math.hypot(x - downX, y - downY) < 12 * density) {
            snapshot();
            int n = ImageOps.magicWand(px, w, h, (int) ix(x), (int) iy(y), tolerance, mask);
            if (n == 0) undo.pop();
            else changed(0, 0, w, h);
        } else if (mode == PICK && listener != null && picked != 0) {
            listener.onPicked(picked);
        } else if (mode == ERASE || mode == RESTORE) {
            if (listener != null) listener.onChanged();
        }
    }

    private int pickAt(float x, float y) {
        int cx = Math.max(0, Math.min(w - 1, (int) ix(x))), cy = Math.max(0, Math.min(h - 1, (int) iy(y)));
        int c = ImageOps.average(px, w, h, cx, cy, 1, mask);
        return c == 0 ? picked : c;
    }

    private void paint(float x0, float y0, float x1, float y1) {
        float rad = brushDp * density / scale;
        float d = (float) Math.hypot(x1 - x0, y1 - y0) / scale;
        int steps = Math.max(1, (int) Math.ceil(d / Math.max(1f, rad * 0.35f)));
        int l = w, t = h, rr = 0, b = 0;
        for (int s = 0; s <= steps; s++) {
            float k = (float) s / steps;
            int[] box = ImageOps.brush(mask, w, h, ix(x0 + (x1 - x0) * k), iy(y0 + (y1 - y0) * k), rad, mode == RESTORE);
            if (box == null) continue;
            l = Math.min(l, box[0]);
            t = Math.min(t, box[1]);
            rr = Math.max(rr, box[2]);
            b = Math.max(b, box[3]);
        }
        if (rr > l && b > t) {
            maskEdited = true;
            refresh(l, t, rr, b);
        }
    }

    private int hitHandle(float x, float y) {
        float cl = sx(crop.left), ct = sy(crop.top), cr = sx(crop.right), cb = sy(crop.bottom);
        float near = 28 * density;
        int hnd = 0;
        if (Math.abs(x - cl) < near && y > ct - near && y < cb + near) hnd |= H_LEFT;
        else if (Math.abs(x - cr) < near && y > ct - near && y < cb + near) hnd |= H_RIGHT;
        if (Math.abs(y - ct) < near && x > cl - near && x < cr + near) hnd |= H_TOP;
        else if (Math.abs(y - cb) < near && x > cl - near && x < cr + near) hnd |= H_BOTTOM;
        if (hnd == 0 && x > cl && x < cr && y > ct && y < cb) hnd = H_MOVE;
        return hnd;
    }

    private void dragCrop(float dx, float dy) {
        float min = Math.max(16, 24 * density / scale);
        RectF c = new RectF(startCrop);
        if (handle == H_MOVE) {
            c.offset(dx, dy);
            if (c.left < 0) c.offset(-c.left, 0);
            if (c.top < 0) c.offset(0, -c.top);
            if (c.right > w) c.offset(w - c.right, 0);
            if (c.bottom > h) c.offset(0, h - c.bottom);
            crop.set(c);
            return;
        }
        if (handle == 0) return;
        if ((handle & H_LEFT) != 0) c.left = Math.max(0, Math.min(c.right - min, c.left + dx));
        if ((handle & H_RIGHT) != 0) c.right = Math.min(w, Math.max(c.left + min, c.right + dx));
        if ((handle & H_TOP) != 0) c.top = Math.max(0, Math.min(c.bottom - min, c.top + dy));
        if ((handle & H_BOTTOM) != 0) c.bottom = Math.min(h, Math.max(c.top + min, c.bottom + dy));
        if (aspect > 0) {
            // Keep the shape: follow the side that moved, anchored on the opposite one.
            boolean horizontal = (handle & (H_LEFT | H_RIGHT)) != 0;
            float cw = c.width(), ch = c.height();
            if (horizontal) ch = cw / aspect;
            else cw = ch * aspect;
            float maxH = (handle & H_TOP) != 0 ? c.bottom : (handle & H_BOTTOM) != 0 ? h - c.top : h;
            float maxW = (handle & H_LEFT) != 0 ? c.right : (handle & H_RIGHT) != 0 ? w - c.left : w;
            if (ch > maxH) {
                ch = maxH;
                cw = ch * aspect;
            }
            if (cw > maxW) {
                cw = maxW;
                ch = cw / aspect;
            }
            if ((handle & H_LEFT) != 0) c.left = c.right - cw;
            else if ((handle & H_RIGHT) != 0) c.right = c.left + cw;
            else {
                float mid = c.centerX();
                c.left = mid - cw / 2;
                c.right = mid + cw / 2;
            }
            if ((handle & H_TOP) != 0) c.top = c.bottom - ch;
            else if ((handle & H_BOTTOM) != 0) c.bottom = c.top + ch;
            else {
                float mid = c.centerY();
                c.top = mid - ch / 2;
                c.bottom = mid + ch / 2;
            }
        }
        crop.set(c);
        keepCropInside();
    }

    private void keepCropInside() {
        if (crop.left < 0) crop.offset(-crop.left, 0);
        if (crop.top < 0) crop.offset(0, -crop.top);
        if (crop.right > w) crop.offset(w - crop.right, 0);
        if (crop.bottom > h) crop.offset(0, h - crop.bottom);
        crop.intersect(0, 0, w, h);
    }

    private void beginNav(MotionEvent e) {
        beginNav(e, -1);
    }

    private void beginNav(MotionEvent e, int skip) {
        float fx = 0, fy = 0;
        int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i == skip) continue;
            fx += e.getX(i);
            fy += e.getY(i);
            n++;
        }
        if (n == 0) return;
        navFx = fx / n;
        navFy = fy / n;
        float span = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i != skip) span += Math.hypot(e.getX(i) - navFx, e.getY(i) - navFy);
        }
        navSpan = span / n;
    }

    private void nav(MotionEvent e) {
        int n = e.getPointerCount();
        float fx = 0, fy = 0;
        for (int i = 0; i < n; i++) {
            fx += e.getX(i);
            fy += e.getY(i);
        }
        fx /= n;
        fy /= n;
        float span = 0;
        for (int i = 0; i < n; i++) span += Math.hypot(e.getX(i) - fx, e.getY(i) - fy);
        span /= n;
        // Zoom about the fingers, keeping the picture point under them in place.
        float bx = ix(navFx), by = iy(navFy);
        if (n >= 2 && navSpan > 10 * density) zoom = Math.max(1f, Math.min(12f, zoom * span / navSpan));
        scale = fit * zoom;
        float ntx = fx - bx * scale, nty = fy - by * scale;
        panX = ntx - (getWidth() / 2f - w / 2f * scale);
        panY = nty - (getHeight() / 2f - h / 2f * scale);
        if (zoom == 1f) panX = panY = 0;
        updateTransform();
        navFx = fx;
        navFy = fy;
        navSpan = span;
    }
}
