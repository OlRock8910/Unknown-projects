package com.infinink.app.model;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.util.ArrayList;
import java.util.List;

public class ModelTest {

    private static Stroke line(float x0, float x1, float y) {
        int n = (int) ((x1 - x0) / 2) + 1;
        float[] p = new float[3 * n];
        for (int i = 0; i < n; i++) {
            p[3 * i] = x0 + i * 2;
            p[3 * i + 1] = y;
            p[3 * i + 2] = 0.5f;
        }
        return new Stroke(Brush.PEN, 0xFF000000, 4, 0, p);
    }

    @Test
    public void eraseMiddleSplitsInTwo() {
        Stroke s = line(0, 200, 0);
        List<Stroke> pieces = s.erase(100, 0, 10);
        assertNotNull(pieces);
        assertEquals(2, pieces.size());
        assertTrue(pieces.get(0).bounds().maxX < 100);
        assertTrue(pieces.get(1).bounds().minX > 100);
    }

    @Test
    public void eraseMissLeavesStrokeAlone() {
        assertNull(line(0, 200, 0).erase(100, 50, 10));
    }

    @Test
    public void eraseEverything() {
        List<Stroke> pieces = line(0, 10, 0).erase(5, 0, 30);
        assertNotNull(pieces);
        assertTrue(pieces.isEmpty());
    }

    @Test
    public void erasingAClosedBoxLeavesOneOpenPiece() {
        float[] box = {0, 0, .5f, 100, 0, .5f, 100, 100, .5f, 0, 100, .5f};
        Stroke s = new Stroke(Brush.PEN, 0xFF000000, 3, Stroke.GEOMETRY | Stroke.CLOSED | Stroke.FILL, box);
        List<Stroke> pieces = s.erase(100, 50, 8); // cut the right side
        assertNotNull(pieces);
        assertEquals(1, pieces.size());
        assertFalse(pieces.get(0).has(Stroke.CLOSED));
        assertFalse(pieces.get(0).has(Stroke.FILL));
    }

    @Test
    public void arrowHeadStaysOnTheEndPiece() {
        float[] arrow = {0, 0, .5f, 200, 0, .5f};
        Stroke s = new Stroke(Brush.PEN, 0xFF000000, 3, Stroke.GEOMETRY | Stroke.ARROW, arrow);
        List<Stroke> pieces = s.erase(100, 0, 10);
        assertEquals(2, pieces.size());
        assertFalse(pieces.get(0).has(Stroke.ARROW));
        assertTrue(pieces.get(1).has(Stroke.ARROW));
    }

    @Test
    public void hitsAndSweptHits() {
        Stroke s = line(0, 100, 0);
        assertTrue(s.hits(50, 3, 2));
        assertFalse(s.hits(50, 30, 2));
        // The eraser jumped clean across the line between two touch samples.
        assertTrue(s.hitsSegment(50, -40, 50, 40, 2));
    }

    @Test
    public void changeUndoRedoKeepsOrder() {
        List<Item> items = new ArrayList<>();
        Stroke a = line(0, 10, 0), b = line(0, 10, 10), c = line(0, 10, 20);
        Change add = new Change();
        add.apply(items, null, a);
        add.apply(items, null, b);
        add.apply(items, null, c);
        History h = new History();
        h.push(add);

        // Split b in place: its pieces must sit between a and c.
        Stroke b1 = line(0, 4, 10), b2 = line(6, 10, 10);
        Change split = new Change();
        split.apply(items, b, b1, b2);
        h.push(split);
        assertEquals(4, items.size());
        assertSame(a, items.get(0));
        assertSame(b1, items.get(1));
        assertSame(b2, items.get(2));
        assertSame(c, items.get(3));

        assertTrue(h.undo(items));
        assertEquals(3, items.size());
        assertSame(b, items.get(1));
        assertTrue(h.redo(items));
        assertSame(b2, items.get(2));
        assertTrue(h.undo(items));
        assertTrue(h.undo(items));
        assertTrue(items.isEmpty());
        assertFalse(h.canUndo());
    }

    @Test
    public void chainedStepsInOneChangeUndoExactly() {
        // An eraser drag erases a stroke, then erases one of its pieces again.
        List<Item> items = new ArrayList<>();
        Stroke a = line(0, 100, 0), z = line(0, 100, 50);
        items.add(a);
        items.add(z);
        Change c = new Change();
        Stroke p1 = line(0, 40, 0), p2 = line(60, 100, 0);
        c.apply(items, a, p1, p2);
        c.apply(items, p2, new Item[0]);
        assertEquals(2, items.size());
        c.undo(items);
        assertEquals(2, items.size());
        assertSame(a, items.get(0));
        assertSame(z, items.get(1));
    }

    @Test
    public void boardRoundTrips() throws Exception {
        Board b = new Board("abc", "Ideas ✏️");
        b.paper = 0xFF1E1F24;
        b.pattern = Board.PATTERN_GRID;
        b.viewX = 12;
        b.viewY = -40;
        b.viewScale = 2.5f;
        b.items.add(line(0, 50, 5));
        b.items.add(new Note(Note.STICKY, 10, 20, 200, 120, 18, 0xFFFFE58F, 0xFF222222, "Buy milk\nand ✨ paper"));
        b.items.add(new Picture("img1.jpg", -50, -60, 300, 200));

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        BoardCodec.write(b, new DataOutputStream(bytes));
        Board r = BoardCodec.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray())));

        assertEquals("abc", r.id);
        assertEquals("Ideas ✏️", r.name);
        assertEquals(b.paper, r.paper);
        assertEquals(Board.PATTERN_GRID, r.pattern);
        assertEquals(2.5f, r.viewScale, 0);
        assertEquals(3, r.items.size());
        Stroke s = (Stroke) r.items.get(0);
        assertEquals(((Stroke) b.items.get(0)).pts.length, s.pts.length);
        Note n = (Note) r.items.get(1);
        assertEquals("Buy milk\nand ✨ paper", n.text);
        assertEquals(0xFFFFE58F, n.paper);
        Picture p = (Picture) r.items.get(2);
        assertEquals("img1.jpg", p.file);

        BoardCodec.Header h = BoardCodec.readHeader(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray())));
        assertEquals(3, h.itemCount);
        assertEquals("Ideas ✏️", h.name);
    }

    @Test
    public void viewportZoomKeepsFocusPoint() {
        Viewport v = new Viewport();
        v.tx = 100;
        v.ty = 50;
        float bx = v.toBoardX(300), by = v.toBoardY(400);
        v.zoomAt(300, 400, 3f);
        assertEquals(3f, v.scale, 1e-6);
        assertEquals(300, v.toScreenX(bx), 1e-3);
        assertEquals(400, v.toScreenY(by), 1e-3);
        v.zoomAt(0, 0, 1e6f);
        assertEquals(Viewport.MAX_SCALE, v.scale, 0);
    }

    @Test
    public void transformMovesAndScales() {
        Note n = new Note(Note.TEXT, 10, 10, 100, 40, 20, 0, 0xFF000000, "hi");
        Note t = n.transformed(2, 5, -5);
        assertEquals(25, t.x, 0);
        assertEquals(15, t.y, 0);
        assertEquals(200, t.w, 0);
        assertEquals(40, t.fontSize, 0);
        Stroke s = line(0, 10, 0).transformed(2, 1, 1);
        assertEquals(8, s.size, 0);
        assertEquals(21, s.pts[s.pts.length - 3], 0);
    }

    @Test
    public void recolorKeepsHighlighterSeeThrough() {
        Stroke s = new Stroke(Brush.HIGHLIGHTER, 0x66FFFF00, 20, 0, new float[]{0, 0, .5f});
        assertEquals(0x660000FF, s.recolored(0xFF0000FF).color);
    }
}
