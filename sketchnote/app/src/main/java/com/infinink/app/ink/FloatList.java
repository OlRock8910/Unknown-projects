package com.infinink.app.ink;

import java.util.Arrays;

/** A growable float array, so live strokes do not box every coordinate. */
public final class FloatList {
    private float[] data;
    private int size;

    public FloatList() {
        this(64);
    }

    public FloatList(int capacity) {
        data = new float[Math.max(4, capacity)];
    }

    public void add(float v) {
        if (size == data.length) data = Arrays.copyOf(data, data.length * 2);
        data[size++] = v;
    }

    public void add(float a, float b) {
        add(a);
        add(b);
    }

    public void add(float a, float b, float c) {
        add(a);
        add(b);
        add(c);
    }

    public float get(int i) {
        return data[i];
    }

    public void set(int i, float v) {
        data[i] = v;
    }

    public int size() {
        return size;
    }

    public void clear() {
        size = 0;
    }

    public void truncate(int newSize) {
        if (newSize < size) size = Math.max(0, newSize);
    }

    /** The backing array; only the first {@link #size()} values mean anything. */
    public float[] raw() {
        return data;
    }

    public float[] toArray() {
        return Arrays.copyOf(data, size);
    }
}
