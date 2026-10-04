package com.strobeglyph.app.ui;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.animation.LinearInterpolator;

import android.view.View;

/**
 * The hero read-out: a glowing disc showing the speed in big numerals. While the show runs it
 * breathes slowly, deliberately not in time with the strobe, so the app's own UI never flickers.
 */
public final class GlowOrb extends View {
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint caption = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bolt = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path boltPath = new Path();

    private boolean running;
    private String bigText = "";
    private String unitText = "";
    private String captionText = "";
    private int captionColor = Ui.DIM;
    private float pulse;
    private ValueAnimator animator;

    public GlowOrb(Context c) {
        super(c);
        float sp = c.getResources().getDisplayMetrics().scaledDensity;
        big.setColor(Ui.TEXT);
        big.setTextAlign(Paint.Align.CENTER);
        big.setTypeface(Ui.light());
        big.setTextSize(68 * sp);
        small.setColor(Ui.DIM);
        small.setTextAlign(Paint.Align.CENTER);
        small.setTypeface(Ui.medium());
        small.setTextSize(15 * sp);
        small.setLetterSpacing(0.2f);
        caption.setTextAlign(Paint.Align.CENTER);
        caption.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        caption.setTextSize(13 * sp);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(Ui.dp(c, 3));
        bolt.setStyle(Paint.Style.FILL);
        setContentDescription("Speed read-out. Tap to start or stop.");
        setClickable(true);
        setFocusable(true);
    }

    /** {@code big} is the headline number, {@code unit} sits under it, {@code caption} under that. */
    public void setReadout(boolean running, String big, String unit, String caption, int captionColor) {
        boolean changed = running != this.running;
        this.running = running;
        this.bigText = big;
        this.unitText = unit;
        this.captionText = caption;
        this.captionColor = captionColor;
        if (changed) {
            if (running) {
                startPulse();
            } else {
                stopPulse();
            }
        }
        invalidate();
    }

    private void startPulse() {
        stopPulse();
        animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(1800);
        animator.setRepeatMode(ValueAnimator.REVERSE);
        animator.setRepeatCount(ValueAnimator.INFINITE);
        animator.setInterpolator(new LinearInterpolator());
        animator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator a) {
                pulse = (Float) a.getAnimatedValue();
                invalidate();
            }
        });
        animator.start();
    }

    private void stopPulse() {
        if (animator != null) {
            animator.cancel();
            animator = null;
        }
        pulse = 0f;
    }

    @Override
    protected void onDetachedFromWindow() {
        stopPulse();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float w = getWidth();
        float h = getHeight();
        float cx = w / 2f;
        float cy = h / 2f;
        float r = Math.min(w, h) / 2f;
        float body = r * 0.74f;

        int tint = running ? Ui.ACCENT : Ui.FAINT;
        int glowAlpha = running ? (int) (70 + 60 * pulse) : 26;
        glow.setShader(new RadialGradient(cx, cy, r,
                new int[] {Ui.withAlpha(tint, glowAlpha), Ui.withAlpha(tint, glowAlpha / 3), 0},
                new float[] {0.55f, 0.82f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawCircle(cx, cy, r, glow);

        disc.setShader(new RadialGradient(cx, cy - body * 0.3f, body * 1.2f,
                new int[] {0xFF1D2431, 0xFF0D1118}, null, Shader.TileMode.CLAMP));
        canvas.drawCircle(cx, cy, body, disc);

        ring.setColor(running ? Ui.withAlpha(Ui.ACCENT, (int) (170 + 85 * pulse)) : Ui.STROKE);
        canvas.drawCircle(cx, cy, body, ring);

        // lightning bolt
        float bs = body * 0.2f;
        float bx = cx;
        float by = cy - body * 0.56f;
        boltPath.reset();
        boltPath.moveTo(bx + bs * 0.25f, by - bs);
        boltPath.lineTo(bx - bs * 0.55f, by + bs * 0.15f);
        boltPath.lineTo(bx - bs * 0.05f, by + bs * 0.15f);
        boltPath.lineTo(bx - bs * 0.25f, by + bs);
        boltPath.lineTo(bx + bs * 0.55f, by - bs * 0.2f);
        boltPath.lineTo(bx + bs * 0.05f, by - bs * 0.2f);
        boltPath.close();
        bolt.setColor(running ? Ui.ACCENT : Ui.DIM);
        canvas.drawPath(boltPath, bolt);

        // read-out
        float bigSize = big.getTextSize();
        float textWidth = big.measureText(bigText);
        float limit = body * 1.55f;
        if (textWidth > limit) {
            big.setTextSize(bigSize * limit / textWidth);
        }
        canvas.drawText(bigText, cx, cy + body * 0.17f, big);
        big.setTextSize(bigSize);
        canvas.drawText(unitText, cx, cy + body * 0.43f, small);
        // The caption sits low in the circle, where the chord is narrow: shrink it to fit.
        float captionDy = body * 0.66f;
        float chord = 1.7f * (float) Math.sqrt(Math.max(0f, body * body - captionDy * captionDy));
        float captionSize = caption.getTextSize();
        float captionWidth = caption.measureText(captionText);
        if (captionWidth > chord) {
            caption.setTextSize(captionSize * chord / captionWidth);
        }
        caption.setColor(captionColor);
        canvas.drawText(captionText, cx, cy + captionDy, caption);
        caption.setTextSize(captionSize);
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int w = MeasureSpec.getSize(widthSpec);
        setMeasuredDimension(w, Math.min(w, Ui.dp(getContext(), 290)));
    }
}
