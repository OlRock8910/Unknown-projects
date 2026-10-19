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
    public void turnedPictureBoundsAndHits() {
        Picture p = new Picture("a.jpg", 0, 0, 200, 100).rotated((float) (Math.PI / 2), 100, 50);
        assertEquals(Math.PI / 2, p.angle, 1e-5);
        assertEquals(100, p.centerX(), 1e-3);
        Box b = p.bounds();
        assertEquals(100, b.width(), 0.01f);  // now standing up
        assertEquals(200, b.height(), 0.01f);
        assertTrue(p.hits(100, -40, 0));      // inside the turned picture
        assertFalse(p.hits(180, 50, 0));      // where it used to be, but not any more
        Picture back = p.rotated((float) (-Math.PI / 2), 100, 50);
        assertEquals(0, back.angle, 1e-5);
        assertEquals(0, back.x, 1e-3);
    }

    @Test
    public void strokeTurnsAboutAPoint() {
        Stroke s = new Stroke(Brush.PEN, 0xFF000000, 2, 0, new float[]{10, 0, .5f});
        Stroke r = s.rotated((float) (Math.PI / 2), 0, 0);
        assertEquals(0, r.pts[0], 1e-4);
        assertEquals(10, r.pts[1], 1e-4);
    }

    @Test
    public void turnedPictureRoundTripsAndOldFilesStillOpen() throws Exception {
        Board b = new Board("x", "Turns");
        b.items.add(new Picture("p.png", 1, 2, 30, 40, 0.75f));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        BoardCodec.write(b, new DataOutputStream(bytes));
        Picture p = (Picture) BoardCodec.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()))).items.get(0);
        assertEquals(0.75f, p.angle, 1e-6);

        // A version 1 file, as written before pictures could turn.
        ByteArrayOutputStream v1 = new ByteArrayOutputStream();
        DataOutputStream o = new DataOutputStream(v1);
        o.writeInt(0x494E4B42);
        o.writeInt(1);
        for (String str : new String[]{"old", "Old board"}) {
            byte[] u = str.getBytes("UTF-8");
            o.writeInt(u.length);
            o.write(u);
        }
        o.writeLong(1);
        o.writeLong(2);
        o.writeInt(0xFFFFFFFF);
        o.writeInt(Board.PATTERN_DOTS);
        o.writeInt(1);
        o.writeFloat(0);
        o.writeFloat(0);
        o.writeFloat(1);
        o.writeByte(3);
        byte[] f = "pic.jpg".getBytes("UTF-8");
        o.writeInt(f.length);
        o.write(f);
        o.writeFloat(5);
        o.writeFloat(6);
        o.writeFloat(70);
        o.writeFloat(80);
        o.writeByte(0);
        Board old = BoardCodec.read(new DataInputStream(new ByteArrayInputStream(v1.toByteArray())));
        Picture op = (Picture) old.items.get(0);
        assertEquals("pic.jpg", op.file);
        assertEquals(0, op.angle, 0);
        assertEquals(70, op.w, 0);
    }

    private static List<Item> stack(int n) {
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < n; i++) items.add(line(0, 10, i));
        return items;
    }

    @Test
    public void arrangeSendsBehindAndBringsInFront() {
        List<Item> items = stack(5);
        Item a = items.get(0), b = items.get(1), c = items.get(2), d = items.get(3), e = items.get(4);
        List<Item> back = Arrange.order(items, java.util.Arrays.asList(d, b), Arrange.BACK);
        assertEquals(java.util.Arrays.asList(b, d, a, c, e), back);
        List<Item> front = Arrange.order(items, java.util.Arrays.asList(b), Arrange.FRONT);
        assertEquals(java.util.Arrays.asList(a, c, d, e, b), front);
        List<Item> fwd = Arrange.order(items, java.util.Arrays.asList(b, c), Arrange.FORWARD);
        assertEquals(java.util.Arrays.asList(a, d, b, c, e), fwd);
        List<Item> bwd = Arrange.order(items, java.util.Arrays.asList(e), Arrange.BACKWARD);
        assertEquals(java.util.Arrays.asList(a, b, c, e, d), bwd);
        // Already at the back: nothing moves.
        assertEquals(items, Arrange.order(items, java.util.Arrays.asList(a), Arrange.BACK));
    }

    @Test
    public void reorderUndoesExactly() {
        List<Item> items = stack(6);
        List<Item> before = new ArrayList<>(items);
        List<Item> target = Arrange.order(items, java.util.Arrays.asList(items.get(4), items.get(1)), Arrange.BACK);
        Change c = new Change();
        c.reorder(items, target);
        assertEquals(target, items);
        c.undo(items);
        assertEquals(before, items);
        c.redo(items);
        assertEquals(target, items);
        Change none = new Change();
        none.reorder(items, new ArrayList<>(items));
        assertTrue(none.isEmpty());
    }

    @Test
    public void noteFontAndFormattingRoundTrip() throws Exception {
        Board b = new Board("f", "Fonts");
        b.items.add(new Note(Note.TEXT, 0, 0, 300, 50, 30, 0, 0xFF112233, "Hi", "Caveat", Note.BOLD | Note.CENTER));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        BoardCodec.write(b, new DataOutputStream(bytes));
        Note n = (Note) BoardCodec.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()))).items.get(0);
        assertEquals("Caveat", n.font);
        assertTrue(n.has(Note.BOLD));
        assertTrue(n.has(Note.CENTER));
        assertFalse(n.has(Note.ITALIC));
        // Moving or recolouring keeps the font.
        assertEquals("Caveat", n.transformed(2, 1, 1).font);
        assertEquals(Note.BOLD | Note.CENTER, n.recolored(0xFFFF0000).fmt);
    }

    @Test
    public void recolorKeepsHighlighterSeeThrough() {
        Stroke s = new Stroke(Brush.HIGHLIGHTER, 0x66FFFF00, 20, 0, new float[]{0, 0, .5f});
        assertEquals(0x660000FF, s.recolored(0xFF0000FF).color);
    }
}
