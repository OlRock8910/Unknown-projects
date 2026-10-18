package com.infinink.app.ui;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

/** Lays children out in rows, wrapping to the next row when one is full. */
public final class FlowLayout extends ViewGroup {
    private final int gapX, gapY;

    public FlowLayout(Context c, float gapXdp, float gapYdp) {
        super(c);
        gapX = Ui.dp(c, gapXdp);
        gapY = Ui.dp(c, gapYdp);
    }

    @Override
    protected void onMeasure(int wSpec, int hSpec) {
        int maxW = MeasureSpec.getSize(wSpec) - getPaddingLeft() - getPaddingRight();
        if (MeasureSpec.getMode(wSpec) == MeasureSpec.UNSPECIFIED) maxW = Integer.MAX_VALUE;
        int x = 0, y = 0, rowH = 0, widest = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View ch = getChildAt(i);
            if (ch.getVisibility() == GONE) continue;
            ch.measure(MeasureSpec.makeMeasureSpec(maxW, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
            int cw = ch.getMeasuredWidth(), chh = ch.getMeasuredHeight();
            if (x > 0 && x + cw > maxW) {
                y += rowH + gapY;
                x = 0;
                rowH = 0;
            }
            x += cw + gapX;
            widest = Math.max(widest, x - gapX);
            rowH = Math.max(rowH, chh);
        }
        int w = MeasureSpec.getMode(wSpec) == MeasureSpec.EXACTLY ? MeasureSpec.getSize(wSpec)
                : widest + getPaddingLeft() + getPaddingRight();
        setMeasuredDimension(w, y + rowH + getPaddingTop() + getPaddingBottom());
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int maxW = r - l - getPaddingLeft() - getPaddingRight();
        int x = 0, y = 0, rowH = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View ch = getChildAt(i);
            if (ch.getVisibility() == GONE) continue;
            int cw = ch.getMeasuredWidth(), chh = ch.getMeasuredHeight();
            if (x > 0 && x + cw > maxW) {
                y += rowH + gapY;
                x = 0;
                rowH = 0;
            }
            ch.layout(getPaddingLeft() + x, getPaddingTop() + y, getPaddingLeft() + x + cw, getPaddingTop() + y + chh);
            x += cw + gapX;
            rowH = Math.max(rowH, chh);
        }
    }
}
