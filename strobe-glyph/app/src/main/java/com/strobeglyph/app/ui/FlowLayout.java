package com.strobeglyph.app.ui;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

/** Lays children out left to right and wraps to a new row when one does not fit. */
public final class FlowLayout extends ViewGroup {
    private final int gap;

    public FlowLayout(Context c, float gapDp) {
        super(c);
        gap = Ui.dp(c, gapDp);
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int maxWidth = MeasureSpec.getSize(widthSpec) - getPaddingLeft() - getPaddingRight();
        int x = 0;
        int y = 0;
        int rowHeight = 0;
        int widest = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            if (child.getVisibility() == GONE) {
                continue;
            }
            child.measure(MeasureSpec.makeMeasureSpec(maxWidth, MeasureSpec.AT_MOST),
                    MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
            int w = child.getMeasuredWidth();
            if (x > 0 && x + w > maxWidth) {
                x = 0;
                y += rowHeight + gap;
                rowHeight = 0;
            }
            x += w + gap;
            rowHeight = Math.max(rowHeight, child.getMeasuredHeight());
            widest = Math.max(widest, x - gap);
        }
        int height = y + rowHeight + getPaddingTop() + getPaddingBottom();
        int width = MeasureSpec.getMode(widthSpec) == MeasureSpec.EXACTLY
                ? MeasureSpec.getSize(widthSpec)
                : widest + getPaddingLeft() + getPaddingRight();
        setMeasuredDimension(width, height);
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int maxWidth = r - l - getPaddingLeft() - getPaddingRight();
        int x = 0;
        int y = 0;
        int rowHeight = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            if (child.getVisibility() == GONE) {
                continue;
            }
            int w = child.getMeasuredWidth();
            int h = child.getMeasuredHeight();
            if (x > 0 && x + w > maxWidth) {
                x = 0;
                y += rowHeight + gap;
                rowHeight = 0;
            }
            int left = getPaddingLeft() + x;
            int top = getPaddingTop() + y;
            child.layout(left, top, left + w, top + h);
            x += w + gap;
            rowHeight = Math.max(rowHeight, h);
        }
    }
}
