package com.infinink.app.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

/** Stacking order: what the "bring to front / send to back" buttons do to the board's list. */
public final class Arrange {
    public static final int FRONT = 0, FORWARD = 1, BACKWARD = 2, BACK = 3;

    private Arrange() {}

    /** The board's items in their new order (bottom first); the selected ones keep their own order. */
    public static List<Item> order(List<Item> items, List<? extends Item> selected, int how) {
        Set<Item> sel = Collections.newSetFromMap(new IdentityHashMap<Item, Boolean>());
        sel.addAll(selected);
        List<Item> out = new ArrayList<>(items);
        switch (how) {
            case FRONT:
            case BACK: {
                List<Item> picked = new ArrayList<>(), rest = new ArrayList<>();
                for (Item it : items) (sel.contains(it) ? picked : rest).add(it);
                out.clear();
                if (how == BACK) {
                    out.addAll(picked);
                    out.addAll(rest);
                } else {
                    out.addAll(rest);
                    out.addAll(picked);
                }
                break;
            }
            case FORWARD:
                // Each selected run hops over the one item just above it.
                for (int i = out.size() - 2; i >= 0; i--) {
                    if (sel.contains(out.get(i)) && !sel.contains(out.get(i + 1))) Collections.swap(out, i, i + 1);
                }
                break;
            case BACKWARD:
                for (int i = 1; i < out.size(); i++) {
                    if (sel.contains(out.get(i)) && !sel.contains(out.get(i - 1))) Collections.swap(out, i, i - 1);
                }
                break;
        }
        return out;
    }
}
