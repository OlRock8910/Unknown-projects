package com.infinink.app.model;

import java.util.ArrayList;
import java.util.List;

/**
 * One undoable edit: a run of "replace this item with these" steps. Adding is replacing nothing,
 * deleting is replacing with nothing, and moving or erasing part of a stroke is replacing it with
 * new copies in the same place in the stacking order.
 *
 * Steps are applied in order and reverted in reverse order, and each remembers the index it
 * worked at, so an edit built up live (an eraser dragged across many strokes) undoes exactly.
 */
public final class Change {
    private static final Item[] NONE = new Item[0];

    private static final class Step {
        final Item before;
        final Item[] after;
        int index = -1;

        Step(Item before, Item[] after) {
            this.before = before;
            this.after = after;
        }
    }

    private final List<Step> steps = new ArrayList<>();

    public boolean isEmpty() {
        return steps.isEmpty();
    }

    /** Replaces before (or, when null, adds on top) with after, right now, and records it. */
    public void apply(List<Item> items, Item before, Item... after) {
        Step s = new Step(before, after == null ? NONE : after);
        run(items, s);
        steps.add(s);
    }

    public void apply(List<Item> items, Item before, List<? extends Item> after) {
        apply(items, before, after.toArray(new Item[0]));
    }

    /** Applies every step again (redo). */
    public void redo(List<Item> items) {
        for (Step s : steps) run(items, s);
    }

    public void undo(List<Item> items) {
        for (int i = steps.size() - 1; i >= 0; i--) {
            Step s = steps.get(i);
            if (s.index < 0) continue;
            for (int k = 0; k < s.after.length; k++) items.remove(s.index);
            if (s.before != null) items.add(s.index, s.before);
        }
    }

    private static void run(List<Item> items, Step s) {
        int idx;
        if (s.before == null) {
            idx = items.size();
        } else {
            idx = indexOf(items, s.before);
            if (idx < 0) {
                // Should not happen; leave the board alone rather than corrupt it.
                s.index = -1;
                return;
            }
            items.remove(idx);
        }
        s.index = idx;
        for (int k = 0; k < s.after.length; k++) items.add(idx + k, s.after[k]);
    }

    static int indexOf(List<Item> items, Item item) {
        // Identity, not equals: two identical strokes are still two strokes.
        for (int i = items.size() - 1; i >= 0; i--) if (items.get(i) == item) return i;
        return -1;
    }
}
