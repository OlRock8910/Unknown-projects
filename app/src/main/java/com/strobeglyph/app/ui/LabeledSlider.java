package com.strobeglyph.app.ui;

import android.content.Context;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

/** A title, a live value read-out and a styled slider, with linear or logarithmic travel. */
public final class LabeledSlider extends LinearLayout {
    public interface Formatter {
        String format(float value);
    }

    public interface Listener {
        void onValueChanged(float value);
    }

    private static final int STEPS = 1000;

    private final TextView valueText;
    private final SeekBar bar;
    private float min = 0f;
    private float max = 1f;
    private boolean log;
    private Formatter formatter = new Formatter() {
        @Override
        public String format(float value) {
            return String.valueOf(value);
        }
    };
    private Listener listener;
    private boolean quiet;

    public LabeledSlider(Context c, String title, int accent) {
        super(c);
        setOrientation(VERTICAL);

        LinearLayout head = Ui.row(c);
        TextView name = Ui.sectionTitle(c, title);
        head.addView(name, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f));
        valueText = Ui.text(c, "", 15, Ui.TEXT);
        valueText.setTypeface(Ui.medium());
        valueText.setGravity(Gravity.END);
        head.addView(valueText);
        addView(head, Ui.linear(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

        bar = new SeekBar(c);
        bar.setMax(STEPS);
        float heightDp = 40;
        bar.setProgressDrawable(Ui.sliderTrack(c, accent, heightDp));
        bar.setThumb(Ui.sliderThumb(c, accent));
        bar.setSplitTrack(false);
        bar.setBackground(null);
        bar.setPadding(Ui.dp(c, 13), 0, Ui.dp(c, 13), 0);
        bar.setContentDescription(title);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar s, int progress, boolean fromUser) {
                float v = valueAt(progress);
                valueText.setText(formatter.format(v));
                if (fromUser && !quiet && listener != null) {
                    listener.onValueChanged(v);
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar s) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar s) {
            }
        });
        addView(bar, Ui.linear(LayoutParams.MATCH_PARENT, Ui.dp(c, heightDp), -Ui.dp(c, 13), Ui.dp(c, 2), -Ui.dp(c, 13), 0));
    }

    public void configure(float min, float max, boolean log, Formatter formatter) {
        this.min = min;
        this.max = max;
        this.log = log;
        this.formatter = formatter;
    }

    public void setListener(Listener l) {
        listener = l;
    }

    /** Moves the slider without telling the listener. */
    public void setValue(float v) {
        quiet = true;
        bar.setProgress(progressFor(v));
        valueText.setText(formatter.format(valueAt(bar.getProgress())));
        quiet = false;
    }

    public float getValue() {
        return valueAt(bar.getProgress());
    }

    @Override
    public void setEnabled(boolean enabled) {
        super.setEnabled(enabled);
        bar.setEnabled(enabled);
        setAlpha(enabled ? 1f : 0.4f);
    }

    private float valueAt(int progress) {
        float t = progress / (float) STEPS;
        return log ? (float) (min * Math.pow(max / min, t)) : min + (max - min) * t;
    }

    private int progressFor(float v) {
        float c = Math.max(min, Math.min(max, v));
        double t = log ? Math.log(c / min) / Math.log(max / min) : (c - min) / (max - min);
        return (int) Math.round(t * STEPS);
    }
}
