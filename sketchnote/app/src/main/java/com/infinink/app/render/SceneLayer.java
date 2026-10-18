package com.infinink.app.render;

import android.graphics.Canvas;
import android.graphics.RecordingCanvas;
import android.graphics.RenderNode;

import com.infinink.app.model.Box;
import com.infinink.app.model.Item;

import java.util.List;
import java.util.Set;

/**
 * Android 10+: everything on the board recorded once into a GPU display list, in board
 * coordinates. Panning, zooming and drawing a new stroke then only replay it (no Java work per
 * item per frame); it is re-recorded only when the board's content changes.
 *
 * Kept in its own class so older phones never load RenderNode.
 */
public final class SceneLayer {
    private static final float LIMIT = 1e8f;
    private final RenderNode node = new RenderNode("board");
    private boolean empty = true;

    public void record(List<Item> items, Set<Item> skip, InkRenderer ink) {
        Box b = Box.empty();
        for (Item it : items) if (skip == null || !skip.contains(it)) b.add(it.bounds());
        empty = b.isEmpty();
        if (empty) return;
        // The node clips to its bounds; leave room for what draws just outside an item's box
        // (a sticky note's shadow is at most ~3% of its width).
        float pad = 2 + 0.035f * Math.max(b.width(), b.height());
        int l = (int) Math.floor(Math.max(-LIMIT, b.minX - pad));
        int t = (int) Math.floor(Math.max(-LIMIT, b.minY - pad));
        int r = (int) Math.ceil(Math.min(LIMIT, b.maxX + pad));
        int bt = (int) Math.ceil(Math.min(LIMIT, b.maxY + pad));
        node.setPosition(l, t, r, bt);
        RecordingCanvas c = node.beginRecording();
        try {
            c.translate(-l, -t);
            for (int i = 0, n = items.size(); i < n; i++) {
                Item it = items.get(i);
                if (skip == null || !skip.contains(it)) ink.draw(c, it);
            }
        } finally {
            node.endRecording();
        }
    }

    /** Draws onto a hardware canvas that is already in board coordinates. */
    public void draw(Canvas c) {
        if (!empty) c.drawRenderNode(node);
    }

    public void discard() {
        node.discardDisplayList();
        empty = true;
    }
}
