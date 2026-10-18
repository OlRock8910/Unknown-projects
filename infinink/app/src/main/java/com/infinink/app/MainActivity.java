package com.infinink.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.LinearGradient;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.format.DateUtils;
import android.view.Gravity;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.infinink.app.ink.Shapes;
import com.infinink.app.model.Board;
import com.infinink.app.model.BoardCodec;
import com.infinink.app.model.Brush;
import com.infinink.app.model.Note;
import com.infinink.app.model.Stroke;
import com.infinink.app.model.Viewport;
import com.infinink.app.render.ImageCache;
import com.infinink.app.render.InkRenderer;
import com.infinink.app.render.PaperRenderer;
import com.infinink.app.ui.FlowLayout;
import com.infinink.app.ui.Icons;
import com.infinink.app.ui.Ui;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The board list: your boards as cards, and a button for a new one. */
public final class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private BoardStore store;
    private LinearLayout grid;
    private LinearLayout content;
    private int columns = 2;

    /** Paper style and colour for each template in the "new board" picker. */
    private static final int[][] TEMPLATES = {
            {Board.PATTERN_DOTS, 0xFFFFFFFF}, {Board.PATTERN_GRID, 0xFFFFFFFF}, {Board.PATTERN_LINES, 0xFFFBF5E6},
            {Board.PATTERN_BLANK, 0xFFFFFFFF}, {Board.PATTERN_DOTS, 0xFF23252D}, {Board.PATTERN_GRID, 0xFF1A2B4C},
            {Board.PATTERN_BLANK, 0xFF0F1013}, {Board.PATTERN_DOTS, 0xFFFBF5E6},
    };
    private static final String[] TEMPLATE_NAMES = {
            "Dotted", "Grid", "Ruled cream", "Blank", "Dark dots", "Blueprint", "Black", "Cream dots"
    };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = new BoardStore(this);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xFF1B1430, Ui.BG, Ui.BG}));
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);

        TextView logo = new GradientText(this, "Infinink");
        content.addView(logo);
        TextView sub = Ui.text(this, "Endless paper for sketches, notes and ideas.", 15, Ui.TEXT_2, false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-2, -2);
        sp.setMargins(0, dp(6), 0, dp(22));
        content.addView(sub, sp);

        grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        content.addView(grid, new LinearLayout.LayoutParams(-1, -2));

        scroll.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            @SuppressWarnings("deprecation")
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int top, bottom, left, right;
                if (Build.VERSION.SDK_INT >= 30) {
                    Insets i = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = i.top;
                    bottom = i.bottom;
                    left = i.left;
                    right = i.right;
                } else {
                    top = in.getSystemWindowInsetTop();
                    bottom = in.getSystemWindowInsetBottom();
                    left = in.getSystemWindowInsetLeft();
                    right = in.getSystemWindowInsetRight();
                }
                content.setPadding(left + dp(18), top + dp(28), right + dp(18), bottom + dp(28));
                return in;
            }
        });
        setContentView(scroll);

        if (!getSharedPreferences("app", MODE_PRIVATE).getBoolean("welcomed", false)) {
            getSharedPreferences("app", MODE_PRIVATE).edit().putBoolean("welcomed", true).apply();
            if (store.list().isEmpty()) makeWelcomeBoard();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdown();
    }

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    private void refresh() {
        int widthDp = (int) (getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density);
        columns = Math.max(2, Math.min(6, (widthDp - 36) / 170));
        final List<BoardCodec.Header> boards = store.list();
        grid.removeAllViews();
        LinearLayout row = null;
        int index = 0;
        int total = boards.size() + 1;
        for (int i = 0; i < total; i++) {
            if (index % columns == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, -2);
                rp.setMargins(0, 0, 0, dp(14));
                grid.addView(row, rp);
            }
            View card = i == 0 ? newCard() : boardCard(boards.get(i - 1));
            LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, -2, 1);
            cp.setMargins(index % columns == 0 ? 0 : dp(7), 0, index % columns == columns - 1 ? 0 : dp(7), 0);
            row.addView(card, cp);
            index++;
        }
        // Keep the last row's cards the same width as the others.
        while (index % columns != 0) {
            View pad = new View(this);
            LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, 1, 1);
            cp.setMargins(dp(7), 0, 0, 0);
            row.addView(pad, cp);
            index++;
        }
        if (boards.isEmpty()) {
            TextView empty = Ui.text(this, "Tap New board to start. Everything stays on this device.", 14, Ui.TEXT_2, false);
            LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(-2, -2);
            ep.setMargins(0, dp(10), 0, 0);
            grid.addView(empty, ep);
        }
    }

    private View thumbFrame(View inside) {
        FrameLayout f = new FrameLayout(this);
        f.addView(inside, new FrameLayout.LayoutParams(-1, -1));
        f.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(16));
            }
        });
        f.setClipToOutline(true);
        return f;
    }

    private View newCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        View art = new View(this) {
            private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

            @Override
            protected void onDraw(Canvas c) {
                p.setShader(new LinearGradient(0, 0, getWidth(), getHeight(), 0xFF7C4DFF, 0xFFE0479E, Shader.TileMode.CLAMP));
                c.drawRect(0, 0, getWidth(), getHeight(), p);
                p.setShader(null);
                p.setColor(0x33FFFFFF);
                float r = Math.min(getWidth(), getHeight()) * 0.22f;
                c.drawCircle(getWidth() / 2f, getHeight() / 2f, r, p);
                Icons.draw(c, Icons.PLUS, getWidth() / 2f, getHeight() / 2f, r * 1.2f, 0xFFFFFFFF, 0xFFFFFFFF);
            }
        };
        View frame = thumbFrame(art);
        card.addView(frame, new LinearLayout.LayoutParams(-1, 0));
        aspect(frame);
        TextView name = Ui.text(this, "New board", 15, Ui.TEXT, true);
        name.setPadding(dp(2), dp(10), 0, dp(2));
        card.addView(name);
        TextView when = Ui.text(this, "Pick a paper", 12.5f, Ui.TEXT_2, false);
        when.setPadding(dp(2), dp(3), 0, 0);
        card.addView(when);
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Ui.press(v);
                pickTemplate();
            }
        });
        card.setContentDescription("New board");
        return card;
    }

    /** Thumbnails are 4:3. */
    private void aspect(final View v) {
        v.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View view, int l, int t, int r, int b, int ol, int ot, int or, int ob) {
                int want = (r - l) * 3 / 4;
                if (b - t != want) {
                    view.getLayoutParams().height = want;
                    view.post(new Runnable() {
                        @Override
                        public void run() {
                            view.requestLayout();
                        }
                    });
                }
            }
        });
    }

    private View boardCard(final BoardCodec.Header h) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        final ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setBackgroundColor(h.paper);
        View frame = thumbFrame(img);
        frame.setForeground(Ui.round(0x00000000, dp(16), Ui.HAIRLINE, dp(1)));
        card.addView(frame, new LinearLayout.LayoutParams(-1, 0));
        aspect(frame);
        TextView name = Ui.text(this, h.name, 15, Ui.TEXT, true);
        name.setSingleLine(true);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        name.setPadding(dp(2), dp(10), 0, dp(2));
        card.addView(name);
        String when = DateUtils.getRelativeTimeSpanString(h.modified, System.currentTimeMillis(),
                DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE).toString();
        TextView meta = Ui.text(this, when, 12.5f, Ui.TEXT_2, false);
        meta.setPadding(dp(2), dp(3), 0, 0);
        card.addView(meta);

        final File thumb = store.thumbFile(h.id);
        if (thumb.exists()) {
            io.execute(new Runnable() {
                @Override
                public void run() {
                    final Bitmap b = BitmapFactory.decodeFile(thumb.getAbsolutePath());
                    if (b != null) {
                        main.post(new Runnable() {
                            @Override
                            public void run() {
                                img.setImageBitmap(b);
                            }
                        });
                    }
                }
            });
        }
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                open(h.id);
            }
        });
        card.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                boardMenu(v, h);
                return true;
            }
        });
        card.setContentDescription("Board " + h.name);
        return card;
    }

    private void open(String id) {
        startActivity(new Intent(this, BoardActivity.class).putExtra(BoardActivity.EXTRA_ID, id));
    }

    private void boardMenu(View anchor, final BoardCodec.Header h) {
        PopupMenu pm = new PopupMenu(this, anchor);
        Menu m = pm.getMenu();
        m.add(0, 1, 0, "Open");
        m.add(0, 2, 0, "Rename");
        m.add(0, 3, 0, "Duplicate");
        m.add(0, 4, 0, "Delete");
        pm.setOnMenuItemClickListener(new PopupMenu.OnMenuItemClickListener() {
            @Override
            public boolean onMenuItemClick(MenuItem item) {
                switch (item.getItemId()) {
                    case 1:
                        open(h.id);
                        break;
                    case 2:
                        askName("Rename board", h.name, "Rename", new NameListener() {
                            @Override
                            public void named(String name) {
                                try {
                                    store.rename(h.id, name);
                                } catch (IOException e) {
                                    Toast.makeText(MainActivity.this, "Couldn't rename", Toast.LENGTH_SHORT).show();
                                }
                                refresh();
                            }
                        });
                        break;
                    case 3:
                        try {
                            store.duplicate(h.id, h.name + " copy");
                        } catch (IOException e) {
                            Toast.makeText(MainActivity.this, "Couldn't duplicate", Toast.LENGTH_SHORT).show();
                        }
                        refresh();
                        break;
                    case 4:
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Delete “" + h.name + "”?")
                                .setMessage("The board and everything on it will be gone for good.")
                                .setNegativeButton("Cancel", null)
                                .setPositiveButton("Delete", new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface d, int w) {
                                        store.delete(h.id);
                                        refresh();
                                    }
                                })
                                .show();
                        break;
                }
                return true;
            }
        });
        pm.show();
    }

    private interface NameListener {
        void named(String name);
    }

    private void askName(String title, String current, String action, final NameListener l) {
        final EditText e = new EditText(this);
        e.setSingleLine(true);
        e.setText(current);
        e.setSelectAllOnFocus(true);
        e.setTextColor(Ui.TEXT);
        FrameLayout wrap = new FrameLayout(this);
        wrap.setPadding(dp(20), dp(8), dp(20), 0);
        wrap.addView(e);
        AlertDialog d = new AlertDialog.Builder(this)
                .setTitle(title)
                .setView(wrap)
                .setNegativeButton("Cancel", null)
                .setPositiveButton(action, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String n = e.getText().toString().trim();
                        if (!n.isEmpty()) l.named(n);
                    }
                })
                .create();
        d.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        d.show();
        e.requestFocus();
    }

    // ---- new boards -----------------------------------------------------------------------------

    private void pickTemplate() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(16), dp(4), dp(16), dp(8));
        FlowLayout flow = new FlowLayout(this, 10, 12);
        final AlertDialog[] dlg = new AlertDialog[1];
        int tile = Math.min(dp(96), (getResources().getDisplayMetrics().widthPixels - dp(120)) / 3);
        for (int i = 0; i < TEMPLATES.length; i++) {
            final int k = i;
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER_HORIZONTAL);
            PaperTile t = new PaperTile(this, TEMPLATES[i][0], TEMPLATES[i][1]);
            item.addView(thumbFrame(t), new LinearLayout.LayoutParams(tile, tile * 3 / 4));
            TextView n = Ui.text(this, TEMPLATE_NAMES[i], 12.5f, Ui.TEXT, false);
            n.setPadding(0, dp(6), 0, 0);
            item.addView(n);
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (dlg[0] != null) dlg[0].dismiss();
                    create(TEMPLATES[k][0], TEMPLATES[k][1]);
                }
            });
            flow.addView(item);
        }
        col.addView(flow);
        dlg[0] = new AlertDialog.Builder(this).setTitle("Choose your paper").setView(col).setNegativeButton("Cancel", null).show();
    }

    private void create(int pattern, int paper) {
        Board b = new Board(BoardStore.newId(), nextName());
        b.pattern = pattern;
        b.paper = paper;
        try {
            store.save(b);
            open(b.id);
        } catch (IOException e) {
            Toast.makeText(this, "Couldn't create a board", Toast.LENGTH_SHORT).show();
        }
    }

    private String nextName() {
        List<BoardCodec.Header> all = store.list();
        int n = all.size() + 1;
        while (true) {
            String name = "Board " + n;
            boolean taken = false;
            for (BoardCodec.Header h : all) if (h.name.equals(name)) taken = true;
            if (!taken) return name;
            n++;
        }
    }

    /** A first board that shows what the app can do, made of real, editable items. */
    private void makeWelcomeBoard() {
        Board b = new Board(BoardStore.newId(), "Welcome");
        b.pattern = Board.PATTERN_DOTS;
        b.paper = 0xFFFFFFFF;
        ImageCache noImages = new ImageCache(getCacheDir());
        InkRenderer ink = new InkRenderer(noImages, false);

        Note title = new Note(Note.TEXT, -360, -300, 720, 60, 46, 0, 0xFF1C1C1E, "Your page never ends.");
        b.items.add(title.withSize(title.w, ink.measureNoteHeight(title)));
        // A highlighter swipe under the title.
        b.items.add(new Stroke(Brush.HIGHLIGHTER, 0x66FFC53D, 26, Stroke.GEOMETRY,
                new float[]{-362, -232, .5f, 120, -232, .5f}));

        String[][] tips = {
                {"✌️ Two fingers to move and zoom. Tap with two fingers to undo, three to redo."},
                {"✍️ Pens, pencil, brush, calligraphy, marker and highlighter. Tap a tool again for size, colour and opacity."},
                {"⭕ Hold still at the end of a line and it snaps into a perfect shape."},
                {"➰ Lasso things to move, resize, recolour or copy them. Add photos to mark up."},
        };
        int[] colors = {0xFFFFE58F, 0xFFB5DEFF, 0xFFC4EDB0, 0xFFFFC2D4};
        for (int i = 0; i < tips.length; i++) {
            float x = -360 + (i % 2) * 380, y = -160 + (i / 2) * 250;
            Note n = new Note(Note.STICKY, x, y, 340, 200, 21, colors[i], 0xFF1C1C1E, tips[i][0]);
            b.items.add(n.withSize(n.w, ink.measureNoteHeight(n)));
        }
        // A clean circle and an arrow pointing at the notes, like hand annotations.
        b.items.add(new Stroke(Brush.PEN, 0xFFE5484D, 4, Stroke.GEOMETRY | Stroke.CLOSED,
                Shapes.build(Shapes.ELLIPSE, 440, -190, 620, -60)));
        b.items.add(new Stroke(Brush.PEN, 0xFFE5484D, 4, Stroke.GEOMETRY | Stroke.ARROW,
                Shapes.build(Shapes.ARROW, 470, -50, 400, 30)));
        Note hint = new Note(Note.TEXT, 470, -138, 130, 40, 22, 0, 0xFFE5484D, "Try it here!");
        b.items.add(hint.withSize(hint.w, ink.measureNoteHeight(hint)));

        b.viewX = 60;
        b.viewY = 0;
        float w = getResources().getDisplayMetrics().widthPixels, hgt = getResources().getDisplayMetrics().heightPixels;
        b.viewScale = Math.min(1.4f, Viewport.fitScale(b.contentBounds(), w, hgt * 0.8f, dp(24)));
        b.viewX = b.contentBounds().centerX();
        b.viewY = b.contentBounds().centerY();
        try {
            store.save(b);
            Bitmap t = Exporter.thumbnail(b, ink, new PaperRenderer(getResources().getDisplayMetrics().density * 0.5f), 480, 360);
            store.saveThumb(b.id, t);
        } catch (IOException ignored) {
            // Not worth bothering anyone about.
        } finally {
            noImages.shutdown();
        }
    }

    /** A little preview of a paper template. */
    private static final class PaperTile extends View {
        private final int pattern, paper;
        private final PaperRenderer renderer;
        private final Viewport vp = new Viewport();

        PaperTile(Activity a, int pattern, int paper) {
            super(a);
            this.pattern = pattern;
            this.paper = paper;
            renderer = new PaperRenderer(a.getResources().getDisplayMetrics().density * 0.6f);
            vp.scale = 0.5f;
        }

        @Override
        protected void onDraw(Canvas c) {
            renderer.draw(c, paper, pattern, vp, getWidth(), getHeight());
        }
    }

    /** The app name in the accent gradient. */
    private static final class GradientText extends TextView {
        GradientText(Activity a, String s) {
            super(a);
            setText(s);
            setTextSize(36);
            setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD));
            setLetterSpacing(-0.02f);
            setIncludeFontPadding(false);
        }

        @Override
        protected void onSizeChanged(int w, int h, int ow, int oh) {
            getPaint().setShader(new LinearGradient(0, 0, w, 0, new int[]{0xFFB69CFF, 0xFFF0A3D0}, null, Shader.TileMode.CLAMP));
        }
    }
}
