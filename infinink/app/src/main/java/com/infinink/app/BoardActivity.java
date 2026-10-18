package com.infinink.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.SubMenu;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.infinink.app.ink.Shapes;
import com.infinink.app.model.Board;
import com.infinink.app.model.History;
import com.infinink.app.model.Item;
import com.infinink.app.model.Note;
import com.infinink.app.render.ImageCache;
import com.infinink.app.render.InkRenderer;
import com.infinink.app.render.PaperRenderer;
import com.infinink.app.ui.CanvasView;
import com.infinink.app.ui.ColorPickerView;
import com.infinink.app.ui.FlowLayout;
import com.infinink.app.ui.IconButton;
import com.infinink.app.ui.Icons;
import com.infinink.app.ui.Slider;
import com.infinink.app.ui.StrokePreview;
import com.infinink.app.ui.Swatch;
import com.infinink.app.ui.Ui;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The editor: the infinite canvas with the floating toolbar, tool panels and menus. */
public final class BoardActivity extends Activity implements CanvasView.Listener {
    public static final String EXTRA_ID = "board";

    private static final int REQ_IMAGE = 7;
    private static final int[] TOOL_ICONS = {
            Icons.PEN, Icons.PENCIL, Icons.BRUSH, Icons.CALLIGRAPHY, Icons.MARKER, Icons.HIGHLIGHTER,
            Icons.ERASER, Icons.LASSO, Icons.SHAPES, Icons.TEXT, Icons.NOTE
    };
    private static final int[] SHAPE_ICONS = {
            Icons.S_LINE, Icons.S_ARROW, Icons.S_RECT, Icons.S_ELLIPSE, Icons.S_TRIANGLE, Icons.S_DIAMOND
    };
    private static final String[] SHAPE_NAMES = {"Line", "Arrow", "Rectangle", "Ellipse", "Triangle", "Diamond"};
    private static final float[] NOTE_SIZES = {14, 18, 26, 40};
    private static final String[] NOTE_SIZE_NAMES = {"S", "M", "L", "XL"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private BoardStore store;
    private Board board;
    private final History history = new History();
    private ToolBox tools;
    private ImageCache images;

    private FrameLayout root;
    private CanvasView canvas;
    private LinearLayout topBar;
    private TextView title, zoomBadge, hint;
    private IconButton undoBtn, redoBtn;
    private LinearLayout dockWrap;
    private final IconButton[] toolButtons = new IconButton[ToolBox.COUNT];
    private IconButton colorBtn;
    private FrameLayout panelHolder;
    private LinearLayout selBar;
    private TextView selLabel;
    private IconButton selEdit;
    private int panelFor = -1;
    private boolean dirty;
    private int insetTop, insetBottom, insetLeft, insetRight;

    // ---- lifecycle ------------------------------------------------------------------------------

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = new BoardStore(this);
        tools = new ToolBox(this);
        String id = getIntent().getStringExtra(EXTRA_ID);
        try {
            board = store.load(id);
        } catch (IOException | RuntimeException e) {
            Toast.makeText(this, "Couldn't open that board", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        images = new ImageCache(store.imageDir(board.id));
        tools.adaptToPaper(board.isDarkPaper());
        edgeToEdge();
        buildUi();
        canvas.setup(board, history, tools, images, this);
        selectTool(tools.tool == ToolBox.LASSO ? ToolBox.PEN : tools.tool);
        updateHistoryButtons();
        updateSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (board == null) return;
        canvas.storeView();
        tools.save();
        save(true);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        main.removeCallbacksAndMessages(null);
        io.shutdown();
        if (images != null) images.shutdown();
    }

    @Override
    public void onBackPressed() {
        if (panelFor >= 0) {
            hidePanel();
            return;
        }
        if (!canvas.selection().isEmpty()) {
            canvas.setSelection(new ArrayList<Item>());
            return;
        }
        super.onBackPressed();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent e) {
        if (e.isCtrlPressed() && keyCode == KeyEvent.KEYCODE_Z) {
            if (e.isShiftPressed()) canvas.redo();
            else canvas.undo();
            return true;
        }
        if (e.isCtrlPressed() && keyCode == KeyEvent.KEYCODE_Y) {
            canvas.redo();
            return true;
        }
        if ((keyCode == KeyEvent.KEYCODE_DEL || keyCode == KeyEvent.KEYCODE_FORWARD_DEL) && !canvas.selection().isEmpty()) {
            canvas.deleteSelection();
            return true;
        }
        return super.onKeyDown(keyCode, e);
    }

    // ---- saving ---------------------------------------------------------------------------------

    private final Runnable autosave = new Runnable() {
        @Override
        public void run() {
            canvas.storeView();
            save(false);
        }
    };

    /** Writes a snapshot of the board on the background thread (and the thumbnail if asked). */
    private void save(final boolean withThumb) {
        main.removeCallbacks(autosave);
        if (!dirty && !withThumb) return;
        final boolean changed = dirty;
        dirty = false;
        if (changed) board.modified = System.currentTimeMillis();
        final Board snap = new Board(board.id, board.name);
        snap.created = board.created;
        snap.modified = board.modified;
        snap.paper = board.paper;
        snap.pattern = board.pattern;
        snap.viewX = board.viewX;
        snap.viewY = board.viewY;
        snap.viewScale = board.viewScale;
        snap.items.addAll(board.items); // items never change once on the board, so this is safe
        final float density = getResources().getDisplayMetrics().density;
        io.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    store.save(snap);
                    if (withThumb && (changed || !store.thumbFile(snap.id).exists())) {
                        InkRenderer r = new InkRenderer(images, false);
                        Bitmap t = Exporter.thumbnail(snap, r, new PaperRenderer(density * 0.5f), 480, 360);
                        store.saveThumb(snap.id, t);
                        t.recycle();
                    }
                } catch (final IOException | RuntimeException e) {
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(BoardActivity.this, "Couldn't save: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
    }

    // ---- canvas callbacks -----------------------------------------------------------------------

    @Override
    public void onHistoryChanged() {
        updateHistoryButtons();
    }

    @Override
    public void onEdited() {
        dirty = true;
        main.removeCallbacks(autosave);
        main.postDelayed(autosave, 3000);
    }

    @Override
    public void onViewChanged(float scale) {
        zoomBadge.setText(String.format(Locale.US, "%d%%", Math.round(scale * 100)));
    }

    @Override
    public void onSelectionChanged(List<Item> selection) {
        boolean show = !selection.isEmpty() && tools.tool == ToolBox.LASSO;
        selBar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) {
            selLabel.setText(selection.size() == 1 ? "1 item" : selection.size() + " items");
            selEdit.setVisibility(selection.size() == 1 && selection.get(0) instanceof Note ? View.VISIBLE : View.GONE);
        }
        if (panelFor == PANEL_SELECTION_COLOR && !show) hidePanel();
    }

    @Override
    public void onNoteTap(Note existing, float bx, float by) {
        hidePanel();
        editNote(existing, bx, by, tools.tool == ToolBox.NOTE ? Note.STICKY : Note.TEXT);
    }

    @Override
    public void onStylusDetected() {
        showHint("Pen detected: fingers now move the page and your palm is ignored. Change it in the ⋯ menu.");
    }

    // ---- building the screen --------------------------------------------------------------------

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    private void edgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
    }

    /** Dark status-bar icons on light paper, light ones on dark paper. */
    @SuppressWarnings("deprecation")
    private void updateSystemBars() {
        boolean light = !board.isDarkPaper();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light ? mask : 0, mask);
            }
        } else {
            View d = getWindow().getDecorView();
            int f = d.getSystemUiVisibility();
            int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            d.setSystemUiVisibility(light ? f | mask : f & ~mask);
        }
        root.setBackgroundColor(board.paper);
    }

    private void buildUi() {
        root = new FrameLayout(this);
        canvas = new CanvasView(this);
        root.addView(canvas, new FrameLayout.LayoutParams(-1, -1));
        canvas.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                // A tap on the page closes an open panel, and does not also draw.
                if (e.getActionMasked() == MotionEvent.ACTION_DOWN && panelFor >= 0) {
                    hidePanel();
                    return true;
                }
                return false;
            }
        });

        buildTopBar();
        buildDock();
        buildSelectionBar();

        panelHolder = new FrameLayout(this);
        panelHolder.setVisibility(View.GONE);
        root.addView(panelHolder, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));

        hint = Ui.text(this, "", 13.5f, Ui.TEXT, false);
        hint.setBackground(Ui.glass(this, 16));
        hint.setPadding(dp(16), dp(12), dp(16), dp(12));
        hint.setGravity(Gravity.CENTER);
        hint.setLineSpacing(0, 1.15f);
        hint.setVisibility(View.GONE);
        FrameLayout.LayoutParams hp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        root.addView(hint, hp);
        hint.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hint.setVisibility(View.GONE);
            }
        });

        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                readInsets(in);
                layoutChrome();
                return in;
            }
        });
        setContentView(root);
    }

    @SuppressWarnings("deprecation")
    private void readInsets(WindowInsets in) {
        if (Build.VERSION.SDK_INT >= 30) {
            Insets i = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            insetTop = i.top;
            insetBottom = i.bottom;
            insetLeft = i.left;
            insetRight = i.right;
        } else {
            insetTop = in.getSystemWindowInsetTop();
            insetBottom = in.getSystemWindowInsetBottom();
            insetLeft = in.getSystemWindowInsetLeft();
            insetRight = in.getSystemWindowInsetRight();
        }
    }

    private void layoutChrome() {
        int side = dp(10);
        FrameLayout.LayoutParams tp = (FrameLayout.LayoutParams) topBar.getLayoutParams();
        tp.setMargins(insetLeft + side, insetTop + dp(8), insetRight + side, 0);
        topBar.setLayoutParams(tp);
        FrameLayout.LayoutParams dp1 = (FrameLayout.LayoutParams) dockWrap.getLayoutParams();
        dp1.setMargins(insetLeft + side, 0, insetRight + side, insetBottom + dp(12));
        dockWrap.setLayoutParams(dp1);
        FrameLayout.LayoutParams sp = (FrameLayout.LayoutParams) selBar.getLayoutParams();
        sp.setMargins(insetLeft + side, 0, insetRight + side, insetBottom + dp(82));
        selBar.setLayoutParams(sp);
        FrameLayout.LayoutParams pp = (FrameLayout.LayoutParams) panelHolder.getLayoutParams();
        pp.setMargins(insetLeft + side, insetTop + dp(72), insetRight + side, insetBottom + dp(82));
        panelHolder.setLayoutParams(pp);
        FrameLayout.LayoutParams hp = (FrameLayout.LayoutParams) hint.getLayoutParams();
        hp.setMargins(insetLeft + dp(20), insetTop + dp(74), insetRight + dp(20), 0);
        hint.setLayoutParams(hp);
    }

    private IconButton button(int icon, String desc, View.OnClickListener l) {
        IconButton b = new IconButton(this, icon, 44, 22, desc);
        b.setOnClickListener(l);
        return b;
    }

    private void buildTopBar() {
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackground(Ui.glass(this, 26));
        topBar.setPadding(dp(4), dp(3), dp(4), dp(3));
        topBar.setElevation(dp(6));

        topBar.addView(button(Icons.BACK, "Back to boards", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        }));
        title = Ui.text(this, board.name, 16, Ui.TEXT, true);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPadding(dp(4), dp(10), dp(8), dp(10));
        title.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rename();
            }
        });
        topBar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));

        undoBtn = button(Icons.UNDO, "Undo", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                canvas.undo();
            }
        });
        redoBtn = button(Icons.REDO, "Redo", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                canvas.redo();
            }
        });
        topBar.addView(undoBtn);
        topBar.addView(redoBtn);

        zoomBadge = Ui.text(this, "100%", 13, Ui.TEXT, true);
        zoomBadge.setGravity(Gravity.CENTER);
        zoomBadge.setMinWidth(dp(56));
        zoomBadge.setPadding(dp(8), dp(8), dp(8), dp(8));
        zoomBadge.setBackground(Ui.ripple(Ui.round(0x14FFFFFF, dp(16)), Ui.round(0xFFFFFFFF, dp(16))));
        zoomBadge.setContentDescription("Zoom. Tap to switch between 100% and everything");
        zoomBadge.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Math.abs(canvas.viewport().scale - 1f) > 0.01f) canvas.zoomTo(1f);
                else canvas.fitAll();
            }
        });
        LinearLayout.LayoutParams zp = new LinearLayout.LayoutParams(-2, -2);
        zp.setMargins(dp(2), 0, dp(2), 0);
        topBar.addView(zoomBadge, zp);

        final IconButton more = button(Icons.MORE, "More", null);
        more.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showMenu(more);
            }
        });
        topBar.addView(more);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        root.addView(topBar, lp);
    }

    private void buildDock() {
        dockWrap = new LinearLayout(this);
        dockWrap.setOrientation(LinearLayout.HORIZONTAL);
        dockWrap.setGravity(Gravity.CENTER_VERTICAL);
        dockWrap.setBackground(Ui.glass(this, 30));
        dockWrap.setPadding(dp(6), dp(5), dp(6), dp(5));
        dockWrap.setElevation(dp(8));

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (int t = 0; t < ToolBox.COUNT; t++) {
            final int tool = t;
            IconButton b = new IconButton(this, TOOL_ICONS[t], 46, 26, ToolBox.NAMES[t]);
            b.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Ui.press(v);
                    if (tools.tool == tool && panelFor != tool) showToolPanel(tool);
                    else if (tools.tool == tool) hidePanel();
                    else {
                        selectTool(tool);
                        hidePanel();
                    }
                }
            });
            b.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View v) {
                    selectTool(tool);
                    showToolPanel(tool);
                    return true;
                }
            });
            toolButtons[t] = b;
            row.addView(b);
        }
        IconButton image = new IconButton(this, Icons.IMAGE, 46, 25, "Add a picture");
        image.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pickImage();
            }
        });
        row.addView(image);
        scroll.addView(row);
        dockWrap.addView(scroll, new LinearLayout.LayoutParams(0, -2, 1));

        View divider = new View(this);
        divider.setBackgroundColor(Ui.HAIRLINE);
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(dp(1), dp(28));
        dl.setMargins(dp(4), 0, dp(4), 0);
        dockWrap.addView(divider, dl);

        colorBtn = new IconButton(this, Icons.PALETTE, 46, 26, "Colour and size");
        colorBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Ui.press(v);
                if (panelFor == tools.tool) hidePanel();
                else showToolPanel(tools.tool);
            }
        });
        dockWrap.addView(colorBtn);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        root.addView(dockWrap, lp);
    }

    private void buildSelectionBar() {
        selBar = new LinearLayout(this);
        selBar.setOrientation(LinearLayout.HORIZONTAL);
        selBar.setGravity(Gravity.CENTER_VERTICAL);
        selBar.setBackground(Ui.glass(this, 26));
        selBar.setPadding(dp(14), dp(3), dp(4), dp(3));
        selBar.setElevation(dp(8));
        selBar.setVisibility(View.GONE);
        selLabel = Ui.text(this, "", 14, Ui.TEXT_2, true);
        selLabel.setPadding(0, 0, dp(6), 0);
        selBar.addView(selLabel);
        selBar.addView(button(Icons.PALETTE, "Recolour", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSelectionColors();
            }
        }));
        selEdit = button(Icons.EDIT, "Edit text", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                List<Item> sel = canvas.selection();
                if (sel.size() == 1 && sel.get(0) instanceof Note) {
                    Note n = (Note) sel.get(0);
                    editNote(n, n.x, n.y, n.style);
                }
            }
        });
        selBar.addView(selEdit);
        selBar.addView(button(Icons.DUPLICATE, "Duplicate", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                canvas.duplicateSelection();
            }
        }));
        IconButton del = button(Icons.TRASH, "Delete", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                canvas.deleteSelection();
            }
        });
        del.setInk(0xFFFF8A8E);
        selBar.addView(del);
        selBar.addView(button(Icons.CHECK, "Done", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                canvas.setSelection(new ArrayList<Item>());
            }
        }));
        root.addView(selBar, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));
    }

    // ---- tools ----------------------------------------------------------------------------------

    private void selectTool(int t) {
        tools.tool = t;
        if (t != ToolBox.LASSO) canvas.setSelection(new ArrayList<Item>());
        refreshDock();
        onSelectionChanged(canvas.selection());
    }

    private void refreshDock() {
        for (int t = 0; t < ToolBox.COUNT; t++) {
            toolButtons[t].setOn(t == tools.tool);
            if (ToolBox.hasColor(t)) toolButtons[t].setAccent(tools.color(t));
        }
        int t = tools.tool;
        colorBtn.setAccent(ToolBox.hasColor(t) ? tools.color(t) : 0xFF636366);
    }

    private void updateHistoryButtons() {
        undoBtn.setDim(!history.canUndo());
        redoBtn.setDim(!history.canRedo());
    }

    private static final int PANEL_SELECTION_COLOR = 100;

    private void hidePanel() {
        if (panelFor < 0) return;
        panelFor = -1;
        final View v = panelHolder.getChildCount() > 0 ? panelHolder.getChildAt(0) : null;
        if (v == null) {
            panelHolder.setVisibility(View.GONE);
            return;
        }
        v.animate().alpha(0f).translationY(dp(12)).setDuration(140).withEndAction(new Runnable() {
            @Override
            public void run() {
                if (panelFor < 0) {
                    panelHolder.removeAllViews();
                    panelHolder.setVisibility(View.GONE);
                }
            }
        }).start();
    }

    private void showPanel(View content, int forWhat) {
        panelFor = forWhat;
        panelHolder.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.addView(content);
        scroll.setBackground(Ui.glass(this, 24));
        scroll.setElevation(dp(10));
        int w = Math.min(getResources().getDisplayMetrics().widthPixels - insetLeft - insetRight - dp(20), dp(400));
        panelHolder.addView(scroll, new FrameLayout.LayoutParams(w, -2));
        panelHolder.setVisibility(View.VISIBLE);
        scroll.setAlpha(0f);
        scroll.setTranslationY(dp(16));
        scroll.animate().alpha(1f).translationY(0).setDuration(180).start();
    }

    private LinearLayout panelColumn(String heading) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(18), dp(16), dp(18), dp(18));
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView h = Ui.text(this, heading, 17, Ui.TEXT, true);
        head.addView(h, new LinearLayout.LayoutParams(0, -2, 1));
        IconButton close = new IconButton(this, Icons.CLOSE, 36, 18, "Close");
        close.setInk(Ui.TEXT_2);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hidePanel();
            }
        });
        head.addView(close);
        col.addView(head);
        return col;
    }

    private TextView label(LinearLayout col, String text) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView l = Ui.text(this, text, 13, Ui.TEXT_2, true);
        row.addView(l, new LinearLayout.LayoutParams(0, -2, 1));
        TextView value = Ui.text(this, "", 13, Ui.TEXT, true);
        row.addView(value);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, dp(14), 0, dp(2));
        col.addView(row, lp);
        return value;
    }

    private void showToolPanel(final int t) {
        LinearLayout col = panelColumn(ToolBox.NAMES[t]);
        final StrokePreview preview = (ToolBox.isInk(t) || t == ToolBox.SHAPE)
                ? new StrokePreview(this, new InkRenderer(images, false)) : null;
        final Runnable refreshPreview = new Runnable() {
            @Override
            public void run() {
                if (preview == null) return;
                float px = tools.size(t) * getResources().getDisplayMetrics().density;
                if (t == ToolBox.SHAPE) preview.setShape(tools.shape, tools.color(t), px, tools.shapeFill, board.paper);
                else preview.set(ToolBox.brushOf(t), tools.color(t), px, board.paper);
                refreshDock();
            }
        };
        if (preview != null) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(72));
            lp.setMargins(0, dp(12), 0, 0);
            col.addView(preview, lp);
            refreshPreview.run();
        }

        if (t == ToolBox.SHAPE) {
            FlowLayout shapes = new FlowLayout(this, 4, 4);
            final List<IconButton> shapeButtons = new ArrayList<>();
            for (int k = 0; k < Shapes.COUNT; k++) {
                final int kind = k;
                IconButton b = new IconButton(this, SHAPE_ICONS[k], 44, 22, SHAPE_NAMES[k]);
                b.setOn(tools.shape == k);
                shapeButtons.add(b);
                b.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        tools.shape = kind;
                        for (int i = 0; i < shapeButtons.size(); i++) shapeButtons.get(i).setOn(i == kind);
                        refreshPreview.run();
                    }
                });
                shapes.addView(b);
            }
            final IconButton fillBtn = new IconButton(this, Icons.FILL, 44, 22, "Fill shapes");
            fillBtn.setAccent(tools.color(t));
            fillBtn.setOn(tools.shapeFill);
            fillBtn.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    tools.shapeFill = !tools.shapeFill;
                    fillBtn.setOn(tools.shapeFill);
                    refreshPreview.run();
                }
            });
            shapes.addView(fillBtn);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.setMargins(0, dp(10), 0, 0);
            col.addView(shapes, lp);
        }

        if (t == ToolBox.ERASER) {
            LinearLayout modes = new LinearLayout(this);
            final TextView precise = Ui.chip(this, "Precise", tools.eraseMode == ToolBox.ERASE_PRECISE);
            final TextView whole = Ui.chip(this, "Whole strokes", tools.eraseMode == ToolBox.ERASE_WHOLE);
            View.OnClickListener pick = new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    tools.eraseMode = v == whole ? ToolBox.ERASE_WHOLE : ToolBox.ERASE_PRECISE;
                    Ui.styleChip(precise, tools.eraseMode == ToolBox.ERASE_PRECISE);
                    Ui.styleChip(whole, tools.eraseMode == ToolBox.ERASE_WHOLE);
                }
            };
            precise.setOnClickListener(pick);
            whole.setOnClickListener(pick);
            modes.addView(precise);
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-2, -2);
            wp.setMargins(dp(8), 0, 0, 0);
            modes.addView(whole, wp);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.setMargins(0, dp(12), 0, 0);
            col.addView(modes, lp);
        }

        if (t != ToolBox.LASSO) {
            final TextView sizeValue = label(col, t == ToolBox.TEXT || t == ToolBox.NOTE ? "Text size" : "Size");
            Slider size = new Slider(this);
            final float min = tools.minSize(t), max = tools.maxSize(t);
            size.setValue((float) (Math.log(tools.size(t) / min) / Math.log(max / min)));
            sizeValue.setText(sizeText(tools.size(t)));
            size.setListener(new Slider.Listener() {
                @Override
                public void onChange(float v, boolean done) {
                    float s = (float) (min * Math.pow(max / min, v));
                    tools.setSize(t, s);
                    sizeValue.setText(sizeText(tools.size(t)));
                    refreshPreview.run();
                }
            });
            col.addView(size, new LinearLayout.LayoutParams(-1, -2));
        }

        if (ToolBox.hasOpacity(t)) {
            final TextView opValue = label(col, "Opacity");
            Slider op = new Slider(this);
            op.setValue((tools.opacity(t) - 0.05f) / 0.95f);
            opValue.setText(Math.round(tools.opacity(t) * 100) + "%");
            op.setListener(new Slider.Listener() {
                @Override
                public void onChange(float v, boolean done) {
                    tools.setOpacity(t, 0.05f + v * 0.95f);
                    opValue.setText(Math.round(tools.opacity(t) * 100) + "%");
                    refreshPreview.run();
                }
            });
            col.addView(op, new LinearLayout.LayoutParams(-1, -2));
        }

        if (ToolBox.hasColor(t)) {
            label(col, t == ToolBox.NOTE ? "Note colour" : "Colour");
            int[] colors = t == ToolBox.NOTE ? Ui.NOTE_COLORS : Ui.PALETTE;
            col.addView(swatches(colors, tools.color(t), t != ToolBox.NOTE, new ColorPick() {
                @Override
                public void picked(int rgb) {
                    tools.setHue(t, rgb);
                    refreshPreview.run();
                }
            }), new LinearLayout.LayoutParams(-1, -2));
        }

        String tip = tipFor(t);
        if (tip != null) {
            TextView tv = Ui.text(this, tip, 12.5f, Ui.TEXT_2, false);
            tv.setLineSpacing(0, 1.2f);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.setMargins(0, dp(14), 0, 0);
            col.addView(tv, lp);
        }
        showPanel(col, t);
    }

    private static String sizeText(float dp) {
        return dp < 10 ? String.format(Locale.US, "%.1f", dp) : String.valueOf(Math.round(dp));
    }

    private static String tipFor(int t) {
        switch (t) {
            case ToolBox.PEN:
            case ToolBox.PENCIL:
            case ToolBox.BRUSH:
            case ToolBox.CALLIGRAPHY:
            case ToolBox.MARKER:
                return "Hold still at the end of a line to snap it into a clean line, circle, triangle or box.";
            case ToolBox.HIGHLIGHTER:
                return "Hold still at the end to make a perfectly straight highlight.";
            case ToolBox.ERASER:
                return "Precise rubs out just what you touch. The button on a pen, or its eraser end, erases with any tool.";
            case ToolBox.LASSO:
                return "Draw a loop around things to select them, or tap one thing. Drag to move, pull the corner dot to resize.";
            case ToolBox.SHAPE:
                return "Drag on the page to draw. Lines snap to level, upright and 45°.";
            case ToolBox.TEXT:
                return "Tap the page to type. Tap text to edit it, drag it to move it.";
            case ToolBox.NOTE:
                return "Tap the page to stick a note. Tap a note to edit it, drag it to move it.";
        }
        return null;
    }

    private interface ColorPick {
        void picked(int rgb);
    }

    private FlowLayout swatches(int[] colors, int current, boolean allowCustom, final ColorPick pick) {
        final FlowLayout flow = new FlowLayout(this, 2, 2);
        final List<Swatch> all = new ArrayList<>();
        List<Integer> list = new ArrayList<>();
        for (int c : colors) list.add(c);
        if (allowCustom) for (int c : tools.recentColors()) if (!list.contains(c)) list.add(c);
        int rgb = current & 0x00FFFFFF;
        for (final int c : list) {
            final Swatch s = new Swatch(this, c, false);
            s.setPicked((c & 0x00FFFFFF) == rgb);
            s.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    for (Swatch o : all) o.setPicked(o == s);
                    pick.picked(c);
                }
            });
            all.add(s);
            flow.addView(s);
        }
        if (allowCustom) {
            Swatch custom = new Swatch(this, 0, true);
            custom.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    customColor(current(all), new ColorPick() {
                        @Override
                        public void picked(int c) {
                            tools.addRecent(c);
                            for (Swatch o : all) o.setPicked(false);
                            pick.picked(c);
                        }
                    });
                }
            });
            flow.addView(custom);
        }
        return flow;
    }

    private static int current(List<Swatch> all) {
        for (Swatch s : all) if (s.isPicked()) return s.color;
        return 0xFF8B5CF6;
    }

    private void customColor(int start, final ColorPick pick) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(12), dp(20), dp(4));
        final ColorPickerView picker = new ColorPickerView(this);
        picker.setColor(start);
        final View sample = new View(this);
        sample.setBackground(Ui.round(start | 0xFF000000, dp(12)));
        final EditText hex = new EditText(this);
        hex.setSingleLine(true);
        hex.setText(String.format("#%06X", start & 0xFFFFFF));
        hex.setTextColor(Ui.TEXT);
        hex.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        picker.setListener(new ColorPickerView.Listener() {
            @Override
            public void onColor(int rgb) {
                sample.setBackground(Ui.round(rgb, dp(12)));
                hex.setText(String.format("#%06X", rgb & 0xFFFFFF));
            }
        });
        col.addView(picker, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(sample, new LinearLayout.LayoutParams(dp(44), dp(32)));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(0, -2, 1);
        hp.setMargins(dp(12), 0, 0, 0);
        row.addView(hex, hp);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, -2);
        rp.setMargins(0, dp(12), 0, 0);
        col.addView(row, rp);
        new AlertDialog.Builder(this)
                .setTitle("Pick a colour")
                .setView(col)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Use colour", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        int c = picker.color();
                        try {
                            c = Color.parseColor(hex.getText().toString().trim());
                        } catch (IllegalArgumentException ignored) {
                            // keep the picker's colour
                        }
                        pick.picked(c | 0xFF000000);
                    }
                })
                .show();
    }

    private void showSelectionColors() {
        LinearLayout col = panelColumn("Recolour");
        boolean notes = false;
        for (Item it : canvas.selection()) if (it instanceof Note && ((Note) it).style == Note.STICKY) notes = true;
        label(col, "Ink");
        col.addView(swatches(Ui.PALETTE, 0, true, new ColorPick() {
            @Override
            public void picked(int rgb) {
                canvas.recolorSelection(rgb);
            }
        }), new LinearLayout.LayoutParams(-1, -2));
        if (notes) {
            label(col, "Sticky notes");
            col.addView(swatches(Ui.NOTE_COLORS, 0, false, new ColorPick() {
                @Override
                public void picked(int rgb) {
                    canvas.recolorSelection(rgb);
                }
            }), new LinearLayout.LayoutParams(-1, -2));
        }
        showPanel(col, PANEL_SELECTION_COLOR);
    }

    // ---- notes ----------------------------------------------------------------------------------

    private void editNote(final Note existing, final float bx, final float by, final int style) {
        final float density = getResources().getDisplayMetrics().density;
        final float scale = canvas.viewport().scale;
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(8), dp(20), 0);

        final EditText edit = new EditText(this);
        edit.setText(existing != null ? existing.text : "");
        edit.setSelection(edit.getText().length());
        edit.setHint(style == Note.STICKY ? "Write a note…" : "Type here…");
        edit.setMinLines(3);
        edit.setMaxLines(10);
        edit.setGravity(Gravity.TOP | Gravity.START);
        edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        edit.setImeOptions(EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        edit.setTextSize(17);
        edit.setTextColor(Ui.TEXT);
        edit.setHintTextColor(Ui.TEXT_2);
        edit.setBackground(Ui.round(Ui.SURFACE_2, dp(14)));
        edit.setPadding(dp(14), dp(12), dp(14), dp(12));
        col.addView(edit, new LinearLayout.LayoutParams(-1, -2));

        final int[] look = {
                existing != null ? (style == Note.STICKY ? existing.paper : existing.ink)
                        : tools.color(style == Note.STICKY ? ToolBox.NOTE : ToolBox.TEXT) | 0xFF000000
        };
        TextView cl = Ui.text(this, style == Note.STICKY ? "Note colour" : "Colour", 13, Ui.TEXT_2, true);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-2, -2);
        clp.setMargins(0, dp(14), 0, dp(4));
        col.addView(cl, clp);
        col.addView(swatches(style == Note.STICKY ? Ui.NOTE_COLORS : Ui.PALETTE, look[0], style != Note.STICKY, new ColorPick() {
            @Override
            public void picked(int rgb) {
                look[0] = rgb | 0xFF000000;
            }
        }));

        // Text size: relative to the screen now; an existing note keeps its own until changed.
        final float[] chosenDp = {-1};
        final float currentDp = existing != null ? existing.fontSize * scale / density
                : tools.size(style == Note.STICKY ? ToolBox.NOTE : ToolBox.TEXT);
        TextView sl = Ui.text(this, "Text size", 13, Ui.TEXT_2, true);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-2, -2);
        slp.setMargins(0, dp(12), 0, dp(6));
        col.addView(sl, slp);
        LinearLayout sizes = new LinearLayout(this);
        final List<TextView> chips = new ArrayList<>();
        int nearest = 0;
        for (int i = 1; i < NOTE_SIZES.length; i++) {
            if (Math.abs(NOTE_SIZES[i] - currentDp) < Math.abs(NOTE_SIZES[nearest] - currentDp)) nearest = i;
        }
        for (int i = 0; i < NOTE_SIZES.length; i++) {
            final int k = i;
            final TextView chip = Ui.chip(this, NOTE_SIZE_NAMES[i], i == nearest);
            chips.add(chip);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    chosenDp[0] = NOTE_SIZES[k];
                    for (TextView c : chips) Ui.styleChip(c, c == chip);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(i == 0 ? 0 : dp(6), 0, 0, 0);
            sizes.addView(chip, lp);
        }
        col.addView(sizes, new LinearLayout.LayoutParams(-1, -2));

        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle(existing == null ? (style == Note.STICKY ? "New sticky note" : "New text") : "Edit")
                .setView(col)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Done", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        String text = edit.getText().toString().replaceAll("\\s+$", "");
                        if (text.isEmpty()) {
                            if (existing != null) canvas.applyNote(existing, null);
                            return;
                        }
                        float fontPx = chosenDp[0] > 0 ? chosenDp[0] * density / scale : -1;
                        if (style == Note.STICKY) tools.setHue(ToolBox.NOTE, look[0]);
                        else tools.setHue(ToolBox.TEXT, look[0]);
                        if (chosenDp[0] > 0) tools.setSize(style == Note.STICKY ? ToolBox.NOTE : ToolBox.TEXT, chosenDp[0]);
                        refreshDock();
                        canvas.applyNote(existing, buildNote(existing, style, text, look[0], fontPx, bx, by));
                    }
                });
        if (existing != null) {
            b.setNeutralButton("Delete", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface d, int w) {
                    canvas.applyNote(existing, null);
                }
            });
        }
        AlertDialog dlg = b.create();
        dlg.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        dlg.show();
        edit.requestFocus();
    }

    private Note buildNote(Note existing, int style, String text, int color, float fontSize, float bx, float by) {
        InkRenderer ink = canvas.renderer();
        float density = getResources().getDisplayMetrics().density;
        float perPx = canvas.boardPerPixel();
        Note n;
        if (existing == null) {
            float fs = fontSize > 0 ? fontSize : tools.size(style == Note.STICKY ? ToolBox.NOTE : ToolBox.TEXT) * density * perPx;
            if (style == Note.STICKY) {
                float w = fs * 12f;
                n = new Note(Note.STICKY, bx - w / 2, by - fs, w, w, fs, color, 0xFF1C1C1E, text);
            } else {
                float w = Math.min(canvas.getWidth() * 0.8f, 560 * density) * perPx;
                w = Math.max(w, fs * 14f);
                n = new Note(Note.TEXT, bx, by - fs * 0.7f, w, fs, fs, 0, color, text);
            }
        } else {
            float fs = fontSize > 0 ? fontSize : existing.fontSize;
            float w = existing.w * fs / existing.fontSize;
            if (existing.style == Note.STICKY) {
                n = new Note(Note.STICKY, existing.x, existing.y, w, existing.h, fs, color, existing.ink, text);
            } else {
                n = new Note(Note.TEXT, existing.x, existing.y, Math.max(w, fs * 14f), existing.h, fs, 0, color, text);
            }
        }
        // Dark sticky colours get light text.
        if (n.style == Note.STICKY) {
            int ink2 = Board.isDark(n.paper) ? 0xFFF2F2F5 : 0xFF1C1C1E;
            n = new Note(n.style, n.x, n.y, n.w, n.h, n.fontSize, n.paper, ink2, n.text);
        }
        return n.withSize(n.w, ink.measureNoteHeight(n));
    }

    // ---- menu -----------------------------------------------------------------------------------

    private static final int MENU_FIT = 1, MENU_100 = 2, MENU_PNG = 3, MENU_PDF = 4, MENU_GALLERY = 5,
            MENU_FINGER = 6, MENU_HELP = 7, MENU_PATTERN = 20, MENU_PAPER = 40;

    private void showMenu(View anchor) {
        PopupMenu pm = new PopupMenu(this, anchor, Gravity.END);
        Menu m = pm.getMenu();
        m.add(0, MENU_FIT, 0, "Show everything");
        m.add(0, MENU_100, 0, "Zoom to 100%");
        SubMenu pattern = m.addSubMenu(0, 0, 0, "Paper style");
        String[] patterns = {"Blank", "Dots", "Grid", "Lines"};
        for (int i = 0; i < patterns.length; i++) {
            pattern.add(1, MENU_PATTERN + i, 0, patterns[i]).setCheckable(true).setChecked(board.pattern == i);
        }
        pattern.setGroupCheckable(1, true, true);
        SubMenu paper = m.addSubMenu(0, 0, 0, "Paper colour");
        for (int i = 0; i < Ui.PAPERS.length; i++) {
            paper.add(2, MENU_PAPER + i, 0, Ui.PAPER_NAMES[i]).setCheckable(true).setChecked(board.paper == Ui.PAPERS[i]);
        }
        paper.setGroupCheckable(2, true, true);
        m.add(0, MENU_PNG, 0, "Share as image");
        m.add(0, MENU_PDF, 0, "Share as PDF");
        if (Build.VERSION.SDK_INT >= 29) m.add(0, MENU_GALLERY, 0, "Save image to gallery");
        m.add(0, MENU_FINGER, 0, "Draw with finger").setCheckable(true).setChecked(canvas.fingerDraws());
        m.add(0, MENU_HELP, 0, "Gestures & tips");
        pm.setOnMenuItemClickListener(new PopupMenu.OnMenuItemClickListener() {
            @Override
            public boolean onMenuItemClick(MenuItem item) {
                return onMenu(item.getItemId());
            }
        });
        pm.show();
    }

    private boolean onMenu(int id) {
        if (id >= MENU_PAPER && id < MENU_PAPER + Ui.PAPERS.length) {
            boolean wasDark = board.isDarkPaper();
            board.paper = Ui.PAPERS[id - MENU_PAPER];
            if (wasDark != board.isDarkPaper()) {
                tools.adaptToPaper(board.isDarkPaper());
                refreshDock();
            }
            boardLookChanged();
            return true;
        }
        if (id >= MENU_PATTERN && id < MENU_PATTERN + 4) {
            board.pattern = id - MENU_PATTERN;
            boardLookChanged();
            return true;
        }
        switch (id) {
            case MENU_FIT:
                canvas.fitAll();
                return true;
            case MENU_100:
                canvas.zoomTo(1f);
                return true;
            case MENU_PNG:
                export(false, false);
                return true;
            case MENU_PDF:
                export(true, false);
                return true;
            case MENU_GALLERY:
                export(false, true);
                return true;
            case MENU_FINGER:
                boolean draws = !canvas.fingerDraws();
                canvas.setFingerDraws(draws);
                tools.fingerDraws = draws;
                tools.save();
                showHint(draws ? "Your finger draws. Use two fingers to move and zoom."
                        : "Your finger moves the page. Draw with a pen.");
                return true;
            case MENU_HELP:
                help();
                return true;
        }
        return false;
    }

    private void boardLookChanged() {
        dirty = true;
        canvas.redraw();
        updateSystemBars();
        onEdited();
    }

    private void help() {
        String msg = "• Pinch with two fingers to zoom, drag with two fingers to move around. The page never ends.\n\n"
                + "• Tap with two fingers to undo, three fingers to redo.\n\n"
                + "• Hold still at the end of a line to snap it into a clean line, circle, triangle, box or polygon.\n\n"
                + "• With a pen, your palm and fingers are ignored while writing. The pen's button (or eraser end) erases.\n\n"
                + "• Lasso: draw round things to select them, then drag, resize, recolour, duplicate or delete.\n\n"
                + "• Tap the zoom number to jump between 100% and seeing everything.\n\n"
                + "• Everything saves by itself, on your device only.";
        new AlertDialog.Builder(this).setTitle("Gestures & tips").setMessage(msg).setPositiveButton("Got it", null).show();
    }

    private void showHint(String text) {
        hint.setText(text);
        hint.setVisibility(View.VISIBLE);
        hint.setAlpha(0f);
        hint.animate().alpha(1f).setDuration(200).start();
        main.removeCallbacks(hideHint);
        main.postDelayed(hideHint, 4500);
    }

    private final Runnable hideHint = new Runnable() {
        @Override
        public void run() {
            hint.animate().alpha(0f).setDuration(300).withEndAction(new Runnable() {
                @Override
                public void run() {
                    hint.setVisibility(View.GONE);
                }
            }).start();
        }
    };

    private void rename() {
        final EditText e = new EditText(this);
        e.setSingleLine(true);
        e.setText(board.name);
        e.setSelectAllOnFocus(true);
        e.setTextColor(Ui.TEXT);
        FrameLayout wrap = new FrameLayout(this);
        wrap.setPadding(dp(20), dp(8), dp(20), 0);
        wrap.addView(e);
        AlertDialog d = new AlertDialog.Builder(this)
                .setTitle("Rename board")
                .setView(wrap)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Rename", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String n = e.getText().toString().trim();
                        if (n.isEmpty()) return;
                        board.name = n;
                        title.setText(n);
                        dirty = true;
                        save(false);
                    }
                })
                .create();
        d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        d.show();
        e.requestFocus();
    }

    // ---- export ---------------------------------------------------------------------------------

    private void export(final boolean pdf, final boolean toGallery) {
        Toast.makeText(this, pdf ? "Making PDF…" : "Making image…", Toast.LENGTH_SHORT).show();
        final Board snap = new Board(board.id, board.name);
        snap.paper = board.paper;
        snap.pattern = board.pattern;
        snap.items.addAll(board.items);
        final float density = getResources().getDisplayMetrics().density;
        io.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    InkRenderer r = new InkRenderer(images, false);
                    PaperRenderer paper = new PaperRenderer(density);
                    String base = Exporter.safeName(snap.name);
                    final File out = new File(ExportProvider.dir(BoardActivity.this), base + (pdf ? ".pdf" : ".png"));
                    if (pdf) {
                        Exporter.writePdf(snap, r, paper, out);
                    } else {
                        Bitmap bmp = Exporter.render(snap, r, paper, Exporter.area(snap), 4096, 3f);
                        if (toGallery) {
                            saveToGallery(bmp, base);
                            bmp.recycle();
                            toast("Saved to Pictures/Infinink");
                            return;
                        }
                        Exporter.writePng(bmp, out);
                        bmp.recycle();
                    }
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            share(out, pdf ? "application/pdf" : "image/png");
                        }
                    });
                } catch (IOException | RuntimeException | OutOfMemoryError e) {
                    toast("Couldn't export: " + e.getMessage());
                }
            }
        });
    }

    private void saveToGallery(Bitmap bmp, String base) throws IOException {
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, base + "-" + System.currentTimeMillis() + ".png");
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Infinink");
        Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new IOException("no space in gallery");
        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
            if (os == null || !bmp.compress(Bitmap.CompressFormat.PNG, 100, os)) throw new IOException("write failed");
        }
    }

    private void share(File f, String type) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(type);
        Uri uri = ExportProvider.uriFor(f);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_TITLE, board.name);
        send.setClipData(android.content.ClipData.newRawUri(board.name, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(send, "Share " + board.name));
        } catch (RuntimeException e) {
            Toast.makeText(this, "No app to share with", Toast.LENGTH_SHORT).show();
        }
    }

    private void toast(final String s) {
        main.post(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(BoardActivity.this, s, Toast.LENGTH_LONG).show();
            }
        });
    }

    // ---- pictures -------------------------------------------------------------------------------

    private void pickImage() {
        hidePanel();
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("image/*");
        try {
            startActivityForResult(i, REQ_IMAGE);
        } catch (RuntimeException e) {
            Toast.makeText(this, "No app to pick pictures with", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (req != REQ_IMAGE || result != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        io.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final String name = importImage(uri);
                    final BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    BitmapFactory.decodeFile(new File(images.dir(), name).getAbsolutePath(), o);
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            selectTool(ToolBox.LASSO);
                            canvas.addPicture(name, o.outWidth, o.outHeight);
                            onSelectionChanged(canvas.selection());
                        }
                    });
                } catch (IOException | RuntimeException | OutOfMemoryError e) {
                    toast("Couldn't add that picture");
                }
            }
        });
    }

    /** Copies a picture in, upright and at most 2048 px, so the board does not depend on it. */
    private String importImage(Uri uri) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0) throw new IOException("not an image");
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2048) sample *= 2;
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        Bitmap bmp;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            bmp = BitmapFactory.decodeStream(in, null, o);
        }
        if (bmp == null) throw new IOException("not an image");
        int rotation = 0;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in != null) {
                int or = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                rotation = or == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : or == ExifInterface.ORIENTATION_ROTATE_180 ? 180
                        : or == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            }
        } catch (IOException | RuntimeException ignored) {
            // No EXIF: keep it as it is.
        }
        float max = Math.max(bmp.getWidth(), bmp.getHeight());
        if (rotation != 0 || max > 2048) {
            Matrix m = new Matrix();
            float k = Math.min(1f, 2048f / max);
            m.postScale(k, k);
            m.postRotate(rotation);
            Bitmap t = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (t != bmp) bmp.recycle();
            bmp = t;
        }
        boolean alpha = bmp.hasAlpha();
        String name = BoardStore.newId() + (alpha ? ".png" : ".jpg");
        try (OutputStream out = new FileOutputStream(new File(images.dir(), name))) {
            bmp.compress(alpha ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 90, out);
        } finally {
            bmp.recycle();
        }
        return name;
    }
}
