package com.infinink.app.ui;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.animation.AnimationUtils;
import android.view.animation.DecelerateInterpolator;

import com.infinink.app.ToolBox;
import com.infinink.app.ink.FloatList;
import com.infinink.app.ink.Geometry;
import com.infinink.app.ink.ShapeRecognizer;
import com.infinink.app.ink.Shapes;
import com.infinink.app.model.Board;
import com.infinink.app.model.Box;
import com.infinink.app.model.Brush;
import com.infinink.app.model.Change;
import com.infinink.app.model.History;
import com.infinink.app.model.Item;
import com.infinink.app.model.Note;
import com.infinink.app.model.Picture;
import com.infinink.app.model.Stroke;
import com.infinink.app.model.Viewport;
import com.infinink.app.render.ImageCache;
import com.infinink.app.render.InkRenderer;
import com.infinink.app.render.PaperRenderer;
import com.infinink.app.render.SceneLayer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

/**
 * The infinite sheet. One finger or the pen uses the current tool; two fingers pan and pinch-zoom;
 * a quick two-finger tap undoes and a three-finger tap redoes. Once a stylus is seen, fingers stop
 * drawing (palm rejection) unless the user says otherwise.
 */
public final class CanvasView extends View implements ImageCache.Listener {

    public interface Listener {
        void onHistoryChanged();

        /** The board's content changed (for autosave). */
        void onEdited();

        void onViewChanged(float scale);

        void onSelectionChanged(List<Item> selection);

        /** Text/note tool tapped: edit existing, or make a new one at (bx, by) when it is null. */
        void onNoteTap(Note existing, float bx, float by);

        /** First stylus contact: fingers were switched to pan-only. */
        void onStylusDetected();

        /** The eyedropper picked this colour off the page. */
        void onColorPicked(int rgb);
    }

    private static final int M_NONE = 0, M_DRAW = 1, M_ERASE = 2, M_LASSO = 3, M_SHAPE = 4,
            M_NAV = 5, M_MOVE_SEL = 6, M_SCALE_SEL = 7, M_NOTE = 8, M_IGNORE = 9, M_PICK = 10;

    /** Pixels sampled around the eyedropper, shown magnified in the loupe. */
    private static final int LOUPE = 15;

    private static final long HOLD_TO_SNAP_MS = 520;

    private final float density;
    private final Viewport vp = new Viewport();
    private final PaperRenderer paper;
    private ImageCache images;
    private InkRenderer ink;
    private SceneLayer scene;
    private boolean sceneDirty = true;

    private Board board;
    private History history;
    private ToolBox tools;
    private Listener listener;
    private boolean fingerDraws = true;
    private boolean stylusSeen;
    private boolean pendingCenter = true;

    // Current gesture.
    private int mode = M_NONE;
    private int activeId = -1;
    private boolean activeStylus;
    private int gestureTool;
    private long downTime;
    private float downX, downY;

    // Live stroke.
    private final FloatList live = new FloatList(1024);
    private final Path livePath = new Path();
    private int liveBrush, liveColor, liveFlags;
    private float liveSize;
    private float simPressure = 0.5f;
    private float lastSx, lastSy;
    private long lastT;
    private ShapeRecognizer.Shape snapped;
    private float holdX, holdY;

    // Eraser.
    private Change eraseChange;
    private float eraseX = Float.NaN, eraseY = Float.NaN, eraseScreenR;
    private boolean eraseShow;

    // Lasso and selection.
    private final FloatList lasso = new FloatList(512);
    private final Path lassoPath = new Path();
    private final ArrayList<Item> selection = new ArrayList<>();
    private final Set<Item> selectionSet = Collections.newSetFromMap(new IdentityHashMap<Item, Boolean>());
    private Box selBox;
    private float selScale = 1f, selDx, selDy;
    private float gestureBx, gestureBy;
    private Note touchedNote;

    // Shape tool.
    private float shapeX0, shapeY0, shapeX1, shapeY1;

    // Navigation.
    private float navFx, navFy, navSpan;
    private int navCount;
    private int maxPointers;
    private float navTravel;
    private boolean navPanned;
    private float navStartX, navStartY;
    private boolean fingerOnlyGesture;
    private final float[] velT = new float[8], velX = new float[8], velY = new float[8];
    private int velN;
    private boolean flinging;
    private float flingVx, flingVy;
    private long flingLast;
    private ValueAnimator zoomAnim;

    // Eyedropper.
    private boolean pickArmed;
    private Bitmap loupe;
    private Canvas loupeCanvas;
    private int pickColor;
    private float pickX, pickY;
    private final int[] pickPx = new int[9];
    private final Paint pixelated = new Paint();
    private final Path loupeClip = new Path();
    private final Paint loupeText = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final Paint ui = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint uiFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF tmp = new RectF();
    private final Path tmpPath = new Path();

    public CanvasView(Context ctx) {
        super(ctx);
        density = getResources().getDisplayMetrics().density;
        paper = new PaperRenderer(density);
        setFocusable(true);
        setContentDescription("Drawing board");
        ui.setStyle(Paint.Style.STROKE);
        uiFill.setStyle(Paint.Style.FILL);
    }

    public void setup(Board board, History history, ToolBox tools, ImageCache images, Listener listener) {
        this.board = board;
        this.history = history;
        this.tools = tools;
        this.images = images;
        this.listener = listener;
        images.setListener(this);
        ink = new InkRenderer(images, true);
        if (Build.VERSION.SDK_INT >= 29) scene = new SceneLayer();
        fingerDraws = tools.fingerDraws == null || tools.fingerDraws;
        pendingCenter = true;
        sceneDirty = true;
        requestLayout();
        invalidate();
    }

    public Viewport viewport() {
        return vp;
    }

    public InkRenderer renderer() {
        return ink;
    }

    public void setFingerDraws(boolean draws) {
        fingerDraws = draws;
    }

    public boolean fingerDraws() {
        return fingerDraws;
    }

    /** Remembers where we are looking, for the next time the board is opened. */
    public void storeView() {
        if (board == null || getWidth() == 0) return;
        board.viewX = vp.toBoardX(getWidth() / 2f);
        board.viewY = vp.toBoardY(getHeight() / 2f);
        board.viewScale = vp.scale;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (board == null) return;
        if (pendingCenter) {
            vp.center(board.viewX, board.viewY, w / 2f, h / 2f, board.viewScale);
            pendingCenter = false;
        } else if (oldw > 0 && oldh > 0) {
            // Rotation / split screen: keep the middle of the view in the middle.
            float bx = vp.toBoardX(oldw / 2f), by = vp.toBoardY(oldh / 2f);
            vp.center(bx, by, w / 2f, h / 2f, vp.scale);
        }
        viewChanged();
    }

    /** Content changed: rebuild the display list and tell the activity. */
    public void contentChanged() {
        sceneDirty = true;
        recomputeSelBox();
        invalidate();
        if (listener != null) {
            listener.onHistoryChanged();
            listener.onEdited();
        }
    }

    /** The board's look changed (paper, pattern): just redraw. */
    public void redraw() {
        invalidate();
    }

    @Override
    public void onImageLoaded() {
        sceneDirty = true;
        invalidate();
    }

    private boolean navigating() {
        return mode == M_NAV || flinging || (zoomAnim != null && zoomAnim.isRunning());
    }

    private void settled() {
        // Pencil grain is sized for the zoom it was recorded at; refresh it for the new zoom.
        sceneDirty = true;
        invalidate();
        viewChanged();
    }

    private void viewChanged() {
        if (listener != null) listener.onViewChanged(vp.scale);
    }

    // ---- drawing --------------------------------------------------------------------------------

    @Override
    protected void onDraw(Canvas c) {
        if (board == null) return;
        int w = getWidth(), h = getHeight();
        paper.draw(c, board.paper, board.pattern, vp, w, h);

        c.save();
        c.translate(vp.tx, vp.ty);
        c.scale(vp.scale, vp.scale);
        if (scene != null && c.isHardwareAccelerated()) {
            if (sceneDirty) {
                ink.setViewScale(vp.scale);
                scene.record(board.items, selection.isEmpty() ? null : selectionSet, ink);
                sceneDirty = false;
            }
            scene.draw(c);
        } else {
            ink.setViewScale(vp.scale);
            Box visible = vp.visible(w, h);
            for (int i = 0, n = board.items.size(); i < n; i++) {
                Item it = board.items.get(i);
                if (!selectionSet.contains(it) && it.bounds().intersects(visible)) ink.draw(c, it);
            }
        }

        if (!selection.isEmpty()) {
            c.save();
            float ax = selBox.minX, ay = selBox.minY;
            c.translate(ax - ax * selScale + selDx, ay - ay * selScale + selDy);
            c.scale(selScale, selScale);
            for (Item it : selection) ink.draw(c, it);
            c.restore();
        }

        if (mode == M_DRAW && live.size() > 0) {
            ink.setViewScale(vp.scale);
            ink.drawLive(c, liveBrush, liveColor, liveSize, liveFlags, live.raw(), live.size() / 3, livePath);
        } else if (mode == M_SHAPE) {
            float[] pts = Shapes.build(tools.shape, shapeX0, shapeY0, shapeX1, shapeY1);
            ink.drawLive(c, Brush.PEN, liveColor, liveSize, shapeFlags(tools.shape), pts, pts.length / 3, livePath);
        }
        c.restore();

        drawOverlays(c);
    }

    private void drawOverlays(Canvas c) {
        boolean dark = board.isDarkPaper();
        int accent = Ui.ACCENT;
        if (mode == M_LASSO && lasso.size() >= 4) {
            lassoPath.rewind();
            float[] l = lasso.raw();
            lassoPath.moveTo(vp.toScreenX(l[0]), vp.toScreenY(l[1]));
            for (int i = 2; i < lasso.size(); i += 2) lassoPath.lineTo(vp.toScreenX(l[i]), vp.toScreenY(l[i + 1]));
            lassoPath.close();
            uiFill.setColor(0x1A8B5CF6);
            c.drawPath(lassoPath, uiFill);
            ui.setColor(accent);
            ui.setStrokeWidth(1.6f * density);
            ui.setPathEffect(new DashPathEffect(new float[]{6 * density, 5 * density}, 0));
            c.drawPath(lassoPath, ui);
            ui.setPathEffect(null);
        }
        if (!selection.isEmpty() && selBox != null) {
            RectF r = selectionScreenRect(tmp);
            ui.setColor(accent);
            ui.setStrokeWidth(1.5f * density);
            ui.setPathEffect(new DashPathEffect(new float[]{7 * density, 5 * density}, 0));
            c.drawRoundRect(r, 6 * density, 6 * density, ui);
            ui.setPathEffect(null);
            // Resize handle.
            uiFill.setColor(0xFFFFFFFF);
            c.drawCircle(r.right, r.bottom, 9 * density, uiFill);
            uiFill.setColor(accent);
            c.drawCircle(r.right, r.bottom, 6.5f * density, uiFill);
        }
        if (mode == M_PICK && loupe != null) drawLoupe(c);
        if (eraseShow && !Float.isNaN(eraseX)) {
            float sx = vp.toScreenX(eraseX), sy = vp.toScreenY(eraseY);
            uiFill.setColor(dark ? 0x22FFFFFF : 0x22000000);
            c.drawCircle(sx, sy, eraseScreenR, uiFill);
            ui.setColor(dark ? 0x99FFFFFF : 0x88000000);
            ui.setStrokeWidth(1.2f * density);
            c.drawCircle(sx, sy, eraseScreenR, ui);
        }
    }

    /** Arms the eyedropper: the next touch on the page picks the colour under it. */
    public void startColorPick() {
        pickArmed = true;
        setSelection(Collections.<Item>emptyList());
    }

    public boolean picking() {
        return pickArmed;
    }

    /** Draws the few pixels around (sx, sy) exactly as on screen and averages the middle. */
    private void pickAt(float sx, float sy) {
        pickX = sx;
        pickY = sy;
        if (loupe == null) {
            loupe = Bitmap.createBitmap(LOUPE, LOUPE, Bitmap.Config.ARGB_8888);
            loupeCanvas = new Canvas(loupe);
        }
        int half = LOUPE / 2;
        Canvas c = loupeCanvas;
        c.save();
        c.translate(half - sx, half - sy);
        paper.draw(c, board.paper, board.pattern, vp, getWidth(), getHeight());
        c.translate(vp.tx, vp.ty);
        c.scale(vp.scale, vp.scale);
        ink.setViewScale(vp.scale);
        Box area = new Box(vp.toBoardX(sx - half), vp.toBoardY(sy - half), vp.toBoardX(sx + half), vp.toBoardY(sy + half));
        ink.drawAll(c, board.items, area);
        c.restore();
        loupe.getPixels(pickPx, 0, 3, half - 1, half - 1, 3, 3);
        int r = 0, g = 0, b = 0;
        for (int p : pickPx) {
            r += (p >> 16) & 255;
            g += (p >> 8) & 255;
            b += p & 255;
        }
        pickColor = 0xFF000000 | (r / 9) << 16 | (g / 9) << 8 | (b / 9);
        invalidate();
    }

    /** The magnifier above the finger while picking a colour. */
    private void drawLoupe(Canvas c) {
        float rad = 52 * density;
        float cx = pickX, cy = pickY - rad - 40 * density;
        if (cy - rad < 0) cy = pickY + rad + 40 * density;
        c.save();
        loupeClip.rewind();
        loupeClip.addCircle(cx, cy, rad, Path.Direction.CW);
        c.clipPath(loupeClip);
        tmp.set(cx - rad, cy - rad, cx + rad, cy + rad);
        c.drawBitmap(loupe, null, tmp, pixelated);
        c.restore();
        ui.setStrokeWidth(6 * density);
        ui.setColor(pickColor);
        c.drawCircle(cx, cy, rad, ui);
        ui.setStrokeWidth(1.5f * density);
        ui.setColor(0xFFFFFFFF);
        c.drawCircle(cx, cy, rad + 3 * density, ui);
        float cell = 2 * rad / LOUPE;
        ui.setColor(Board.isDark(pickColor) ? 0xFFFFFFFF : 0xFF000000);
        c.drawRect(cx - cell * 1.5f, cy - cell * 1.5f, cx + cell * 1.5f, cy + cell * 1.5f, ui);
        String hex = String.format("#%06X", pickColor & 0xFFFFFF);
        loupeText.setColor(0xFFFFFFFF);
        loupeText.setTextSize(13 * density);
        loupeText.setTextAlign(Paint.Align.CENTER);
        loupeText.setFakeBoldText(true);
        float tw = loupeText.measureText(hex) / 2 + 10 * density;
        tmp.set(cx - tw, cy + rad + 8 * density, cx + tw, cy + rad + 32 * density);
        uiFill.setColor(0xCC000000);
        c.drawRoundRect(tmp, 12 * density, 12 * density, uiFill);
        c.drawText(hex, cx, tmp.bottom - 7 * density, loupeText);
    }

    private RectF selectionScreenRect(RectF out) {
        float pad = 8 * density;
        float ax = selBox.minX, ay = selBox.minY;
        float minX = ax + selDx, minY = ay + selDy;
        float maxX = ax + (selBox.maxX - ax) * selScale + selDx, maxY = ay + (selBox.maxY - ay) * selScale + selDy;
        out.set(vp.toScreenX(minX) - pad, vp.toScreenY(minY) - pad, vp.toScreenX(maxX) + pad, vp.toScreenY(maxY) + pad);
        return out;
    }

    // ---- touch ----------------------------------------------------------------------------------

    private static boolean isPen(MotionEvent e, int i) {
        int t = e.getToolType(i);
        return t == MotionEvent.TOOL_TYPE_STYLUS || t == MotionEvent.TOOL_TYPE_ERASER;
    }

    private static boolean isMouse(MotionEvent e, int i) {
        return e.getToolType(i) == MotionEvent.TOOL_TYPE_MOUSE;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (board == null) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                stopMotion();
                if (pickArmed) {
                    // The eyedropper takes the next touch, from a finger or a pen.
                    mode = M_PICK;
                    activeId = e.getPointerId(0);
                    pickAt(e.getX(), e.getY());
                    return true;
                }
                boolean pen = isPen(e, 0);
                if (pen && !stylusSeen) {
                    stylusSeen = true;
                    if (tools.fingerDraws == null && fingerDraws) {
                        fingerDraws = false;
                        if (listener != null) listener.onStylusDetected();
                    }
                }
                downTime = e.getEventTime();
                downX = e.getX();
                downY = e.getY();
                maxPointers = 1;
                navTravel = 0;
                fingerOnlyGesture = !pen && !isMouse(e, 0);
                if (fingerOnlyGesture && !fingerDraws) {
                    mode = M_NAV;
                    beginNav(e, -1);
                    return true;
                }
                startWith(e, 0);
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN: {
                int i = e.getActionIndex();
                if (mode == M_IGNORE || mode == M_PICK) return true;
                if (mode != M_NAV && mode != M_NONE && activeStylus) return true; // palm while writing
                if (isPen(e, i)) {
                    // A palm (or finger) was resting and has not panned yet: the pen takes over.
                    if (mode == M_NAV && navCount <= 1 && !navPanned) {
                        if (!stylusSeen) {
                            stylusSeen = true;
                            if (tools.fingerDraws == null && fingerDraws) {
                                fingerDraws = false;
                                if (listener != null) listener.onStylusDetected();
                            }
                        }
                        downTime = e.getEventTime();
                        downX = e.getX(i);
                        downY = e.getY(i);
                        startWith(e, i);
                    }
                    return true;
                }
                maxPointers = Math.max(maxPointers, e.getPointerCount());
                if (mode != M_NAV) {
                    abortToolForGesture(e);
                    mode = M_NAV;
                }
                beginNav(e, -1);
                return true;
            }
            case MotionEvent.ACTION_MOVE:
                if (mode == M_PICK) {
                    int pi = e.findPointerIndex(activeId);
                    if (pi >= 0) pickAt(e.getX(pi), e.getY(pi));
                    return true;
                }
                if (mode == M_NAV) nav(e);
                else if (mode != M_NONE && mode != M_IGNORE) moveTool(e);
                return true;
            case MotionEvent.ACTION_POINTER_UP: {
                int i = e.getActionIndex();
                if (mode == M_NAV) {
                    beginNav(e, i);
                } else if (e.getPointerId(i) == activeId && mode != M_NONE && mode != M_IGNORE) {
                    endTool(e, i);
                    mode = M_IGNORE;
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                if (mode == M_PICK) {
                    pickArmed = false;
                    if (listener != null) listener.onColorPicked(pickColor);
                } else if (mode == M_NAV) endNav(e);
                else if (mode != M_NONE && mode != M_IGNORE) endTool(e, 0);
                mode = M_NONE;
                activeId = -1;
                invalidate();
                return true;
            case MotionEvent.ACTION_CANCEL:
                if (mode == M_PICK) pickArmed = false;
                cancelTool();
                if (mode == M_NAV) settled();
                mode = M_NONE;
                activeId = -1;
                invalidate();
                return true;
        }
        return super.onTouchEvent(e);
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent e) {
        // Mouse wheel / trackpad scroll: zoom around the pointer.
        if ((e.getSource() & InputDevice.SOURCE_CLASS_POINTER) != 0 && e.getAction() == MotionEvent.ACTION_SCROLL) {
            float v = e.getAxisValue(MotionEvent.AXIS_VSCROLL);
            if (v != 0) {
                vp.zoomAt(e.getX(), e.getY(), (float) Math.pow(1.15, v));
                settled();
                return true;
            }
        }
        return super.onGenericMotionEvent(e);
    }

    /** Starts the current tool with pointer i (the pen, a mouse, or a drawing finger). */
    private void startWith(MotionEvent e, int i) {
        boolean pen = isPen(e, i);
        activeId = e.getPointerId(i);
        activeStylus = pen || isMouse(e, i);
        if (pen) requestUnbufferedDispatch(e);
        boolean eraserEnd = e.getToolType(i) == MotionEvent.TOOL_TYPE_ERASER
                || (pen && (e.getButtonState() & (MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_SECONDARY)) != 0);
        beginTool(e, i, eraserEnd);
    }

    // ---- navigation -----------------------------------------------------------------------------

    private void beginNav(MotionEvent e, int skip) {
        float sx = 0, sy = 0;
        int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i == skip || isPen(e, i)) continue;
            sx += e.getX(i);
            sy += e.getY(i);
            n++;
        }
        if (n == 0) return;
        navFx = sx / n;
        navFy = sy / n;
        float span = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i == skip || isPen(e, i)) continue;
            span += Geometry.dist(navFx, navFy, e.getX(i), e.getY(i));
        }
        navSpan = span / n;
        navCount = n;
        velN = 0;
        if (skip < 0 && e.getActionMasked() == MotionEvent.ACTION_DOWN) {
            navPanned = false;
            navStartX = navFx;
            navStartY = navFy;
        }
    }

    private void nav(MotionEvent e) {
        float sx = 0, sy = 0;
        int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (isPen(e, i)) continue;
            sx += e.getX(i);
            sy += e.getY(i);
            n++;
        }
        if (n == 0) return;
        if (n != navCount) {
            beginNav(e, -1);
            return;
        }
        float fx = sx / n, fy = sy / n;
        float span = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (!isPen(e, i)) span += Geometry.dist(fx, fy, e.getX(i), e.getY(i));
        }
        span /= n;
        float dx = fx - navFx, dy = fy - navFy;
        if (!navPanned) {
            // One resting finger or palm does nothing until it really moves; two fingers act at once.
            if (n == 1 && Geometry.dist(navStartX, navStartY, fx, fy) < 10 * density) return;
            navPanned = true;
        }
        vp.panBy(dx, dy);
        if (n >= 2 && navSpan > 8 * density && span > 8 * density) {
            vp.zoomAt(fx, fy, span / navSpan);
            navTravel += Math.abs(span - navSpan);
        }
        navTravel += Math.abs(dx) + Math.abs(dy);
        navFx = fx;
        navFy = fy;
        navSpan = span;
        int k = velN % velT.length;
        velT[k] = e.getEventTime();
        velX[k] = fx;
        velY[k] = fy;
        velN++;
        invalidate();
        viewChanged();
    }

    private void endNav(MotionEvent e) {
        long dur = e.getEventTime() - downTime;
        boolean tap = dur < 320 && navTravel < 24 * density;
        if (tap && fingerOnlyGesture && maxPointers == 2) {
            undo();
            performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        } else if (tap && fingerOnlyGesture && maxPointers >= 3) {
            redo();
            performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        } else if (tap && maxPointers == 1 && Geometry.dist(downX, downY, e.getX(), e.getY()) < 12 * density) {
            fingerTap(e.getX(), e.getY());
        } else if (startFling(e.getEventTime())) {
            return;
        }
        settled();
    }

    private boolean startFling(long now) {
        if (velN < 3) return false;
        int newest = (velN - 1) % velT.length;
        int oldest = newest;
        for (int k = 1; k < Math.min(velN, velT.length); k++) {
            int idx = (velN - 1 - k) % velT.length;
            if (velT[newest] - velT[idx] > 80) break;
            oldest = idx;
        }
        float dt = velT[newest] - velT[oldest];
        if (dt <= 0 || now - velT[newest] > 50) return false;
        flingVx = (velX[newest] - velX[oldest]) / dt;
        flingVy = (velY[newest] - velY[oldest]) / dt;
        if (Math.hypot(flingVx, flingVy) < 0.35 * density) return false;
        flinging = true;
        flingLast = AnimationUtils.currentAnimationTimeMillis();
        postOnAnimation(flingStep);
        return true;
    }

    private final Runnable flingStep = new Runnable() {
        @Override
        public void run() {
            if (!flinging) return;
            long now = AnimationUtils.currentAnimationTimeMillis();
            float dt = Math.max(1, now - flingLast);
            flingLast = now;
            vp.panBy(flingVx * dt, flingVy * dt);
            float decay = (float) Math.exp(-dt / 260f);
            flingVx *= decay;
            flingVy *= decay;
            invalidate();
            if (Math.hypot(flingVx, flingVy) < 0.02 * density) {
                flinging = false;
                settled();
            } else {
                postOnAnimation(this);
            }
        }
    };

    private void stopMotion() {
        if (flinging) {
            flinging = false;
            removeCallbacks(flingStep);
            settled();
        }
        if (zoomAnim != null) zoomAnim.cancel();
    }

    /** A finger tap while fingers only pan: still lets the text and lasso tools pick things. */
    private void fingerTap(float x, float y) {
        float bx = vp.toBoardX(x), by = vp.toBoardY(y);
        int t = tools.tool;
        if (t == ToolBox.TEXT || t == ToolBox.NOTE) {
            if (listener != null) listener.onNoteTap(noteAt(bx, by), bx, by);
        } else if (t == ToolBox.LASSO) {
            Item hit = itemAt(bx, by);
            setSelection(hit == null ? Collections.<Item>emptyList() : Collections.singletonList(hit));
        }
    }

    // ---- tools ----------------------------------------------------------------------------------

    private void beginTool(MotionEvent e, int idx, boolean eraserEnd) {
        float x = e.getX(idx), y = e.getY(idx);
        float bx = vp.toBoardX(x), by = vp.toBoardY(y);
        gestureTool = eraserEnd ? ToolBox.ERASER : tools.tool;
        gestureBx = bx;
        gestureBy = by;

        if (gestureTool == ToolBox.LASSO && !selection.isEmpty()) {
            RectF r = selectionScreenRect(tmp);
            if (Geometry.dist(x, y, r.right, r.bottom) < 28 * density) {
                mode = M_SCALE_SEL;
                return;
            }
            r.inset(-6 * density, -6 * density);
            if (r.contains(x, y)) {
                mode = M_MOVE_SEL;
                return;
            }
            setSelection(Collections.<Item>emptyList());
        } else if (!selection.isEmpty()) {
            setSelection(Collections.<Item>emptyList());
        }

        switch (gestureTool) {
            case ToolBox.ERASER:
                mode = M_ERASE;
                eraseChange = new Change();
                eraseScreenR = tools.size(ToolBox.ERASER) * density / 2f;
                eraseShow = true;
                eraseX = eraseY = Float.NaN;
                eraseAt(bx, by);
                break;
            case ToolBox.LASSO:
                mode = M_LASSO;
                lasso.clear();
                lasso.add(bx, by);
                break;
            case ToolBox.SHAPE:
                mode = M_SHAPE;
                liveColor = tools.color(ToolBox.SHAPE);
                liveSize = tools.size(ToolBox.SHAPE) * density / vp.scale;
                shapeX0 = shapeX1 = bx;
                shapeY0 = shapeY1 = by;
                break;
            case ToolBox.TEXT:
            case ToolBox.NOTE:
                mode = M_NOTE;
                touchedNote = noteAt(bx, by);
                break;
            default:
                mode = M_DRAW;
                liveBrush = ToolBox.brushOf(gestureTool);
                liveColor = tools.color(gestureTool);
                liveSize = tools.size(gestureTool) * density / vp.scale;
                liveFlags = activeStylus && !isMouse(e, idx) ? Stroke.REAL_PRESSURE : 0;
                live.clear();
                snapped = null;
                simPressure = 0.5f;
                lastT = e.getEventTime();
                lastSx = x;
                lastSy = y;
                addSample(x, y, e.getPressure(idx), e.getEventTime(), true);
                holdX = x;
                holdY = y;
                removeCallbacks(holdToSnap);
                postDelayed(holdToSnap, HOLD_TO_SNAP_MS);
                break;
        }
        invalidate();
    }

    private void moveTool(MotionEvent e) {
        int i = e.findPointerIndex(activeId);
        if (i < 0) return;
        int hist = e.getHistorySize();
        switch (mode) {
            case M_DRAW:
                for (int h = 0; h < hist; h++) {
                    sample(e.getHistoricalX(i, h), e.getHistoricalY(i, h), e.getHistoricalPressure(i, h), e.getHistoricalEventTime(h));
                }
                sample(e.getX(i), e.getY(i), e.getPressure(i), e.getEventTime());
                if (Geometry.dist(holdX, holdY, e.getX(i), e.getY(i)) > 5 * density && snapped == null) {
                    holdX = e.getX(i);
                    holdY = e.getY(i);
                    removeCallbacks(holdToSnap);
                    postDelayed(holdToSnap, HOLD_TO_SNAP_MS);
                }
                break;
            case M_ERASE:
                for (int h = 0; h < hist; h++) eraseAt(vp.toBoardX(e.getHistoricalX(i, h)), vp.toBoardY(e.getHistoricalY(i, h)));
                eraseAt(vp.toBoardX(e.getX(i)), vp.toBoardY(e.getY(i)));
                break;
            case M_LASSO:
                for (int h = 0; h < hist; h++) lassoAdd(e.getHistoricalX(i, h), e.getHistoricalY(i, h));
                lassoAdd(e.getX(i), e.getY(i));
                break;
            case M_SHAPE:
                shapeX1 = vp.toBoardX(e.getX(i));
                shapeY1 = vp.toBoardY(e.getY(i));
                break;
            case M_MOVE_SEL:
                selDx = vp.toBoardX(e.getX(i)) - gestureBx;
                selDy = vp.toBoardY(e.getY(i)) - gestureBy;
                break;
            case M_SCALE_SEL: {
                float ax = selBox.minX, ay = selBox.minY;
                float d0 = (gestureBx - ax) + (gestureBy - ay);
                float d1 = (vp.toBoardX(e.getX(i)) - ax) + (vp.toBoardY(e.getY(i)) - ay);
                if (d0 > 1e-6f) selScale = Math.max(0.05f, d1 / d0);
                break;
            }
            case M_NOTE:
                if (touchedNote != null && Geometry.dist(downX, downY, e.getX(i), e.getY(i)) > 10 * density) {
                    // Dragging a note with the text tool moves it.
                    setSelection(Collections.<Item>singletonList(touchedNote));
                    mode = M_MOVE_SEL;
                    selDx = vp.toBoardX(e.getX(i)) - gestureBx;
                    selDy = vp.toBoardY(e.getY(i)) - gestureBy;
                }
                break;
        }
        invalidate();
    }

    private void endTool(MotionEvent e, int i) {
        removeCallbacks(holdToSnap);
        switch (mode) {
            case M_DRAW:
                if (snapped == null) sample(e.getX(i), e.getY(i), e.getPressure(i), e.getEventTime());
                commitStroke();
                break;
            case M_ERASE:
                history.push(eraseChange);
                eraseChange = null;
                eraseShow = false;
                if (listener != null) listener.onHistoryChanged();
                break;
            case M_LASSO:
                finishLasso();
                break;
            case M_SHAPE:
                commitShape();
                break;
            case M_MOVE_SEL:
            case M_SCALE_SEL:
                commitSelectionTransform();
                if (gestureTool == ToolBox.TEXT || gestureTool == ToolBox.NOTE) setSelection(Collections.<Item>emptyList());
                break;
            case M_NOTE:
                // A tap: edit the note under it, or start a new one. A drag on empty paper is neither.
                boolean tap = Geometry.dist(downX, downY, e.getX(i), e.getY(i)) < 12 * density;
                if (listener != null && (tap || touchedNote != null)) listener.onNoteTap(touchedNote, gestureBx, gestureBy);
                touchedNote = null;
                break;
        }
    }

    /** A second finger arrived: this was the start of a pinch, not a drawing. */
    private void abortToolForGesture(MotionEvent e) {
        removeCallbacks(holdToSnap);
        switch (mode) {
            case M_DRAW:
                // A long line is kept; the stray start of a pinch is thrown away.
                if (e.getEventTime() - downTime > 400 && live.size() / 3 > 12) commitStroke();
                live.clear();
                break;
            case M_ERASE:
                history.push(eraseChange);
                eraseChange = null;
                eraseShow = false;
                if (listener != null) listener.onHistoryChanged();
                break;
            case M_MOVE_SEL:
            case M_SCALE_SEL:
                commitSelectionTransform();
                break;
            default:
                cancelTool();
        }
        activeId = -1;
    }

    private void cancelTool() {
        removeCallbacks(holdToSnap);
        if (mode == M_ERASE && eraseChange != null) {
            history.push(eraseChange);
            eraseChange = null;
            if (listener != null) listener.onHistoryChanged();
        }
        live.clear();
        lasso.clear();
        eraseShow = false;
        touchedNote = null;
        selScale = 1f;
        selDx = selDy = 0;
    }

    // ---- ink ------------------------------------------------------------------------------------

    private void sample(float sx, float sy, float pressure, long t) {
        if (snapped != null) {
            if (snapped.kind == ShapeRecognizer.LINE) {
                float[] end = Shapes.build(Shapes.LINE, live.get(0), live.get(1), vp.toBoardX(sx), vp.toBoardY(sy));
                live.set(3, end[3]);
                live.set(4, end[4]);
            }
            return;
        }
        addSample(sx, sy, pressure, t, false);
    }

    private void addSample(float sx, float sy, float pressure, long t, boolean first) {
        int n = live.size() / 3;
        if (!first && n > 0 && Geometry.dist(lastSx, lastSy, sx, sy) < 0.5f * density) return;
        float p;
        if ((liveFlags & Stroke.REAL_PRESSURE) != 0) {
            p = pressure <= 0 ? 0.5f : Math.min(1f, pressure);
        } else {
            // Fingers have no pressure: fast strokes come out thinner, slow ones fuller.
            float dt = Math.max(1, t - lastT);
            float speed = Geometry.dist(lastSx, lastSy, sx, sy) / density / dt; // dp per ms
            float target = first ? 0.5f : Math.max(0.2f, Math.min(0.72f, 0.66f - speed * 0.16f));
            simPressure += (target - simPressure) * 0.3f;
            p = simPressure;
        }
        live.add(vp.toBoardX(sx), vp.toBoardY(sy), p);
        lastSx = sx;
        lastSy = sy;
        lastT = t;
    }

    private final Runnable holdToSnap = new Runnable() {
        @Override
        public void run() {
            if (mode != M_DRAW || snapped != null || live.size() / 3 < 4) return;
            ShapeRecognizer.Shape s = ShapeRecognizer.recognize(live.raw(), live.size() / 3);
            if (s == null) return;
            snapped = s;
            live.clear();
            for (int i = 0; i < s.pointCount(); i++) live.add(s.xy[2 * i], s.xy[2 * i + 1], 0.5f);
            liveFlags = Stroke.GEOMETRY | (s.closed ? Stroke.CLOSED : 0);
            if (liveBrush == Brush.CALLIGRAPHY || liveBrush == Brush.BRUSH) liveBrush = Brush.PEN;
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            invalidate();
        }
    };

    private void commitStroke() {
        if (live.size() < 3) return;
        Stroke s = new Stroke(liveBrush, liveColor, liveSize, liveFlags, live.toArray());
        live.clear();
        Change c = new Change();
        c.apply(board.items, null, s);
        history.push(c);
        contentChanged();
    }

    private int shapeFlags(int kind) {
        int f = Stroke.GEOMETRY;
        if (Shapes.isClosed(kind)) {
            f |= Stroke.CLOSED;
            if (tools.shapeFill) f |= Stroke.FILL;
        }
        if (kind == Shapes.ARROW) f |= Stroke.ARROW;
        return f;
    }

    private void commitShape() {
        if (Geometry.dist(shapeX0, shapeY0, shapeX1, shapeY1) * vp.scale < 6 * density) return;
        float[] pts = Shapes.build(tools.shape, shapeX0, shapeY0, shapeX1, shapeY1);
        Stroke s = new Stroke(Brush.PEN, liveColor, liveSize, shapeFlags(tools.shape), pts);
        Change c = new Change();
        c.apply(board.items, null, s);
        history.push(c);
        contentChanged();
    }

    // ---- eraser ---------------------------------------------------------------------------------

    private void eraseAt(float bx, float by) {
        float r = eraseScreenR / vp.scale;
        float fromX = Float.isNaN(eraseX) ? bx : eraseX, fromY = Float.isNaN(eraseY) ? by : eraseY;
        eraseX = bx;
        eraseY = by;
        boolean changed = false;
        if (tools.eraseMode == ToolBox.ERASE_WHOLE) {
            for (int i = board.items.size() - 1; i >= 0; i--) {
                Item it = board.items.get(i);
                boolean hit = it instanceof Stroke
                        ? ((Stroke) it).hitsSegment(fromX, fromY, bx, by, r)
                        : it.hits(bx, by, r);
                if (hit) {
                    eraseChange.apply(board.items, it);
                    changed = true;
                }
            }
        } else {
            // Step along the path the eraser took so a quick swipe does not skip over lines.
            float d = Geometry.dist(fromX, fromY, bx, by);
            int steps = Math.max(1, (int) Math.ceil(d / (r * 0.5f)));
            for (int s = 1; s <= steps; s++) {
                float t = (float) s / steps;
                float x = fromX + (bx - fromX) * t, y = fromY + (by - fromY) * t;
                for (int i = board.items.size() - 1; i >= 0; i--) {
                    Item it = board.items.get(i);
                    if (!(it instanceof Stroke)) continue;
                    List<Stroke> pieces = ((Stroke) it).erase(x, y, r);
                    if (pieces == null) continue;
                    eraseChange.apply(board.items, it, pieces);
                    changed = true;
                }
            }
        }
        if (changed) {
            sceneDirty = true;
            if (listener != null) listener.onEdited();
        }
        invalidate();
    }

    // ---- lasso & selection ----------------------------------------------------------------------

    private void lassoAdd(float sx, float sy) {
        float bx = vp.toBoardX(sx), by = vp.toBoardY(sy);
        int n = lasso.size();
        if (n >= 2 && Geometry.dist(lasso.get(n - 2), lasso.get(n - 1), bx, by) * vp.scale < 3 * density) return;
        lasso.add(bx, by);
    }

    private void finishLasso() {
        int n = lasso.size() / 2;
        float[] poly = lasso.toArray();
        lasso.clear();
        float len = Geometry.length(poly, n, 2) * vp.scale;
        if (n < 3 || len < 24 * density) {
            Item hit = itemAt(gestureBx, gestureBy);
            setSelection(hit == null ? Collections.<Item>emptyList() : Collections.singletonList(hit));
            return;
        }
        List<Item> picked = new ArrayList<>();
        for (Item it : board.items) {
            if (it instanceof Stroke) {
                Stroke s = (Stroke) it;
                int count = s.count(), step = Math.max(1, count / 40), inside = 0, total = 0;
                for (int i = 0; i < count; i += step) {
                    total++;
                    if (Geometry.pointInPolygon(poly, n, s.pts[3 * i], s.pts[3 * i + 1])) inside++;
                }
                if (inside * 10 >= total * 6) picked.add(it);
            } else {
                Box b = it.bounds();
                if (Geometry.pointInPolygon(poly, n, b.centerX(), b.centerY())) picked.add(it);
            }
        }
        setSelection(picked);
    }

    private Item itemAt(float bx, float by) {
        float r = 10 * density / vp.scale;
        for (int i = board.items.size() - 1; i >= 0; i--) {
            Item it = board.items.get(i);
            if (it.hits(bx, by, r)) return it;
        }
        return null;
    }

    private Note noteAt(float bx, float by) {
        for (int i = board.items.size() - 1; i >= 0; i--) {
            Item it = board.items.get(i);
            if (it instanceof Note && it.hits(bx, by, 4 * density / vp.scale)) return (Note) it;
        }
        return null;
    }

    public List<Item> selection() {
        return selection;
    }

    public void setSelection(List<? extends Item> items) {
        if (items.isEmpty() && selection.isEmpty()) return;
        selection.clear();
        selectionSet.clear();
        selection.addAll(items);
        selectionSet.addAll(items);
        selScale = 1f;
        selDx = selDy = 0;
        recomputeSelBox();
        sceneDirty = true;
        invalidate();
        if (listener != null) listener.onSelectionChanged(selection);
    }

    private void recomputeSelBox() {
        // Drop anything an undo took off the board.
        if (!selection.isEmpty()) {
            Set<Item> onBoard = Collections.newSetFromMap(new IdentityHashMap<Item, Boolean>());
            onBoard.addAll(board.items);
            boolean dropped = false;
            for (int i = selection.size() - 1; i >= 0; i--) {
                if (!onBoard.contains(selection.get(i))) {
                    selectionSet.remove(selection.remove(i));
                    dropped = true;
                }
            }
            if (dropped && listener != null) listener.onSelectionChanged(selection);
        }
        selBox = selection.isEmpty() ? null : Board.boundsOf(selection);
    }

    private void commitSelectionTransform() {
        if (selection.isEmpty() || (selScale == 1f && selDx == 0 && selDy == 0)) {
            selScale = 1f;
            selDx = selDy = 0;
            return;
        }
        float ax = selBox.minX, ay = selBox.minY;
        float s = selScale, dx = ax - ax * s + selDx, dy = ay - ay * s + selDy;
        Change c = new Change();
        List<Item> moved = new ArrayList<>();
        for (Item it : selection) {
            Item t = it.transformed(s, dx, dy);
            if (t instanceof Note) {
                Note n = (Note) t;
                t = n.withSize(n.w, ink.measureNoteHeight(n));
            }
            c.apply(board.items, it, t);
            moved.add(t);
        }
        history.push(c);
        selScale = 1f;
        selDx = selDy = 0;
        selection.clear();
        selectionSet.clear();
        selection.addAll(moved);
        selectionSet.addAll(moved);
        contentChanged();
        if (listener != null) listener.onSelectionChanged(selection);
    }

    public void deleteSelection() {
        if (selection.isEmpty()) return;
        Change c = new Change();
        for (Item it : selection) c.apply(board.items, it);
        history.push(c);
        setSelection(Collections.<Item>emptyList());
        contentChanged();
    }

    public void duplicateSelection() {
        if (selection.isEmpty()) return;
        float off = 24 * density / vp.scale;
        Change c = new Change();
        List<Item> copies = new ArrayList<>();
        for (Item it : selection) {
            Item copy = it.transformed(1f, off, off);
            c.apply(board.items, null, copy);
            copies.add(copy);
        }
        history.push(c);
        setSelection(copies);
        contentChanged();
    }

    public void recolorSelection(int rgb) {
        if (selection.isEmpty()) return;
        Change c = new Change();
        List<Item> out = new ArrayList<>();
        for (Item it : selection) {
            Item r = it.recolored(rgb);
            if (r != it) c.apply(board.items, it, r);
            out.add(r);
        }
        history.push(c);
        setSelection(out);
        contentChanged();
    }

    // ---- edits from the activity ----------------------------------------------------------------

    /** Adds (before null), edits, or deletes (after null) a note as one undoable step. */
    public void applyNote(Note before, Note after) {
        Change c = new Change();
        if (before == null && after != null) c.apply(board.items, null, after);
        else if (before != null && after == null) c.apply(board.items, before);
        else if (before != null) c.apply(board.items, before, after);
        history.push(c);
        contentChanged();
    }

    /** Places a picture in the middle of the view, a comfortable size, and selects it. */
    public Picture addPicture(String file, int pw, int ph) {
        float vw = getWidth(), vh = getHeight();
        float targetW = Math.min(vw * 0.7f, vh * 0.6f * pw / Math.max(1, ph)) / vp.scale;
        float w = targetW, h = targetW * ph / Math.max(1, pw);
        float cx = vp.toBoardX(vw / 2), cy = vp.toBoardY(vh / 2);
        Picture p = new Picture(file, cx - w / 2, cy - h / 2, w, h);
        Change c = new Change();
        c.apply(board.items, null, p);
        history.push(c);
        contentChanged();
        setSelection(Collections.<Item>singletonList(p));
        return p;
    }

    /** Swaps one item for another (an edited picture) as one undoable step, and selects it. */
    public void replaceItem(Item before, Item after) {
        Change c = new Change();
        c.apply(board.items, before, after);
        history.push(c);
        contentChanged();
        setSelection(Collections.singletonList(after));
    }

    public void undo() {
        if (history.undo(board.items)) contentChanged();
    }

    public void redo() {
        if (history.redo(board.items)) contentChanged();
    }

    /** Board units per screen pixel right now, for sizing new things. */
    public float boardPerPixel() {
        return 1f / vp.scale;
    }

    public float density() {
        return density;
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        flinging = false;
        removeCallbacks(flingStep);
        removeCallbacks(holdToSnap);
        if (zoomAnim != null) zoomAnim.cancel();
    }

    // ---- view animations ------------------------------------------------------------------------

    public void zoomTo(float scale) {
        float cx = vp.toBoardX(getWidth() / 2f), cy = vp.toBoardY(getHeight() / 2f);
        animateTo(cx, cy, scale);
    }

    /** Zooms to show everything on the board. */
    public void fitAll() {
        Box b = board.contentBounds();
        if (b.isEmpty()) {
            animateTo(0, 0, 1f);
            return;
        }
        float s = Viewport.fitScale(b, getWidth(), getHeight(), 48 * density);
        animateTo(b.centerX(), b.centerY(), Math.min(s, 2f));
    }

    private void animateTo(final float bx, final float by, final float targetScale) {
        stopMotion();
        final float fromX = vp.toBoardX(getWidth() / 2f), fromY = vp.toBoardY(getHeight() / 2f);
        final float fromS = vp.scale, toS = Viewport.clamp(targetScale);
        zoomAnim = ValueAnimator.ofFloat(0f, 1f);
        zoomAnim.setDuration(320);
        zoomAnim.setInterpolator(new DecelerateInterpolator(1.6f));
        zoomAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator a) {
                float t = (float) a.getAnimatedValue();
                // Zoom in log space so it feels even, and move the center along with it.
                float s = (float) Math.exp(Math.log(fromS) + (Math.log(toS) - Math.log(fromS)) * t);
                vp.center(fromX + (bx - fromX) * t, fromY + (by - fromY) * t, getWidth() / 2f, getHeight() / 2f, s);
                invalidate();
                viewChanged();
                if (t >= 1f) settled();
            }
        });
        zoomAnim.start();
    }
}
