package com.infinink.app.model;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/** Undo and redo stacks of {@link Change}s. */
public final class History {
    private static final int LIMIT = 300;

    private final Deque<Change> undo = new ArrayDeque<>();
    private final Deque<Change> redo = new ArrayDeque<>();

    /** Records a change that has already been applied to the board. */
    public void push(Change c) {
        if (c == null || c.isEmpty()) return;
        undo.push(c);
        while (undo.size() > LIMIT) undo.removeLast();
        redo.clear();
    }

    public boolean canUndo() {
        return !undo.isEmpty();
    }

    public boolean canRedo() {
        return !redo.isEmpty();
    }

    public boolean undo(List<Item> items) {
        if (undo.isEmpty()) return false;
        Change c = undo.pop();
        c.undo(items);
        redo.push(c);
        return true;
    }

    public boolean redo(List<Item> items) {
        if (redo.isEmpty()) return false;
        Change c = redo.pop();
        c.redo(items);
        undo.push(c);
        return true;
    }

    public void clear() {
        undo.clear();
        redo.clear();
    }
}
