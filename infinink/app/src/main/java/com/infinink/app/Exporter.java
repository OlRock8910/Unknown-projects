package com.infinink.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.pdf.PdfDocument;

import com.infinink.app.model.Board;
import com.infinink.app.model.Box;
import com.infinink.app.model.Viewport;
import com.infinink.app.render.InkRenderer;
import com.infinink.app.render.PaperRenderer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** Pictures of a board: thumbnails, PNG exports and vector PDFs. */
public final class Exporter {
    private Exporter() {}

    /** The area to export: everything on the board with a margin, or a blank page if empty. */
    public static Box area(Board b) {
        Box c = b.contentBounds();
        if (c.isEmpty()) return new Box(-400, -300, 400, 300);
        float m = Math.max(24f, Math.max(c.width(), c.height()) * 0.04f);
        return new Box(c.minX - m, c.minY - m, c.maxX + m, c.maxY + m);
    }

    /** Draws the board area into a bitmap at most maxSide pixels on its longest side. */
    public static Bitmap render(Board b, InkRenderer ink, PaperRenderer paper, Box area, int maxSide, float maxScale) {
        float scale = Math.min(maxScale, maxSide / Math.max(area.width(), area.height()));
        int w = Math.max(1, Math.round(area.width() * scale)), h = Math.max(1, Math.round(area.height() * scale));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Viewport vp = new Viewport();
        vp.scale = scale;
        vp.tx = -area.minX * scale;
        vp.ty = -area.minY * scale;
        paper.draw(c, b.paper, b.pattern, vp, w, h);
        c.translate(vp.tx, vp.ty);
        c.scale(scale, scale);
        ink.setViewScale(scale);
        ink.drawAll(c, b.items, area);
        return bmp;
    }

    /** A thumbnail for the board list: everything on the board, framed to fit. */
    public static Bitmap thumbnail(Board b, InkRenderer ink, PaperRenderer paper, int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Box content = b.contentBounds();
        Viewport vp = new Viewport();
        if (content.isEmpty()) {
            vp.center(0, 0, w / 2f, h / 2f, 0.5f);
        } else {
            float fit = Math.min(1.2f, Viewport.fitScale(content, w, h, w * 0.07f));
            vp.center(content.centerX(), content.centerY(), w / 2f, h / 2f, fit);
        }
        paper.draw(c, b.paper, b.pattern, vp, w, h);
        c.translate(vp.tx, vp.ty);
        c.scale(vp.scale, vp.scale);
        ink.setViewScale(vp.scale);
        ink.drawAll(c, b.items, vp.visible(w, h));
        return bmp;
    }

    public static void writePng(Bitmap bmp, File out) throws IOException {
        try (OutputStream os = new FileOutputStream(out)) {
            if (!bmp.compress(Bitmap.CompressFormat.PNG, 100, os)) throw new IOException("could not encode image");
        }
    }

    /** One PDF page the shape of the board's content, drawn as vectors so it prints sharp. */
    public static void writePdf(Board b, InkRenderer ink, PaperRenderer paper, File out) throws IOException {
        Box area = area(b);
        // PDF pages top out at 200 inches (14400 points); scale big boards down to fit.
        float scale = Math.min(1f, 14400f / Math.max(area.width(), area.height()));
        int w = Math.max(1, Math.round(area.width() * scale)), h = Math.max(1, Math.round(area.height() * scale));
        PdfDocument doc = new PdfDocument();
        try {
            PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(w, h, 1).create());
            Canvas c = page.getCanvas();
            Viewport vp = new Viewport();
            vp.scale = scale;
            vp.tx = -area.minX * scale;
            vp.ty = -area.minY * scale;
            paper.draw(c, b.paper, b.pattern, vp, w, h);
            c.translate(vp.tx, vp.ty);
            c.scale(scale, scale);
            ink.setViewScale(scale * 2f);
            ink.drawAll(c, b.items, area);
            doc.finishPage(page);
            try (OutputStream os = new FileOutputStream(out)) {
                doc.writeTo(os);
            }
        } finally {
            doc.close();
        }
    }

    public static String safeName(String name) {
        String s = name.replaceAll("[^A-Za-z0-9 _-]", "").trim().replace(' ', '-');
        return s.isEmpty() ? "board" : s;
    }
}
