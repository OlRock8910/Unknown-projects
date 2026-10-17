package com.strobeglyph.app.ui;

import android.content.Context;
import android.view.Gravity;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;

/** A rounded pill that is either selected or not. */
public final class Chip extends TextView {
    private boolean checked;
    private final int accent;

    public Chip(Context c, String label) {
        this(c, label, Ui.ACCENT);
    }

    public Chip(Context c, String label, int accent) {
        super(c);
        this.accent = accent;
        setText(label);
        setTextSize(13.5f);
        setTypeface(Ui.medium());
        setGravity(Gravity.CENTER);
        setSingleLine();
        setIncludeFontPadding(false);
        setPadding(Ui.dp(c, 15), Ui.dp(c, 11), Ui.dp(c, 15), Ui.dp(c, 11));
        setClickable(true);
        setFocusable(true);
        restyle();
    }

    public void setChecked(boolean on) {
        if (checked != on) {
            checked = on;
            restyle();
        }
    }

    public boolean isChecked() {
        return checked;
    }

    @Override
    public void setEnabled(boolean enabled) {
        super.setEnabled(enabled);
        setAlpha(enabled ? 1f : 0.38f);
    }

    private void restyle() {
        Context c = getContext();
        setBackground(Ui.rippled(checked
                ? Ui.rect(c, accent, 20, accent, 1)
                : Ui.rect(c, Ui.SURFACE_HI, 20, Ui.STROKE, 1)));
        setTextColor(checked ? Ui.ON_ACCENT : Ui.TEXT);
        setSelected(checked);
    }

    @Override
    public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(info);
        info.setCheckable(true);
        info.setChecked(checked);
    }
}
