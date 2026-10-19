package com.infinink.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.infinink.app.img.ImageOps;
import com.infinink.app.ui.FlowLayout;
import com.infinink.app.ui.IconButton;
import com.infinink.app.ui.Icons;
import com.infinink.app.ui.ImageEditView;
import com.infinink.app.ui.Slider;
import com.infinink.app.ui.Swatch;
import com.infinink.app.ui.Ui;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Edits a picture before (or after) it goes on a board: crop, rotate and flip; cut out the
 * background with the automatic remover, the magic wand and erase/restore brushes; and pick
 * colours from it. Saves a new file next to the original and reports it back.
 */
public final class ImageEditActivity extends Activity implements ImageEditView.Listener {
    /** Absolute path of the picture to edit. */
    public static final String EXTRA_FILE = "file";
    /** Results: the new file's name (same folder), its size, where the crop started, and colours picked. */
    public static final String RESULT_NAME = "name", RESULT_W = "w", RESULT_H = "h",
            RESULT_CROP_X = "cropX", RESULT_CROP_Y = "cropY", RESULT_TURNED = "turned", RESULT_COLORS = "colors";

    private static final int TAB_CROP = 0, TAB_CUT = 1, TAB_COLOURS = 2;
    private static final String[] ASPECT_NAMES = {"Free", "Original", "Square", "4:3", "3:4", "16:9"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private File source;
    private ImageEditView editor;
    private FrameLayout options;
    private final List<TextView> tabs = new ArrayList<>();
    private IconButton undoBtn;
    private TextView hint;
    private final Set<Integer> picked = new LinkedHashSet<>();
    private float originalAspect = 1f;
    private boolean saving;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        source = new File(String.valueOf(getIntent().getStringExtra(EXTRA_FILE)));
        Bitmap b = null;
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            b = BitmapFactory.decodeFile(source.getAbsolutePath(), o);
        } catch (OutOfMemoryError ignored) {
            // handled below
        }
        if (b == null) {
            Toast.makeText(this, "Couldn't open that picture", Toast.LENGTH_SHORT).show();
            setResult(RESULT_CANCELED);
            finish();
            return;
        }
        int w = b.getWidth(), h = b.getHeight();
        int[] px = new int[w * h];
        b.getPixels(px, 0, w, 0, 0, w, h);
        b.recycle();
        originalAspect = (float) w / h;

        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);

        final LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0E0F13);

        root.addView(topBar());
        editor = new ImageEditView(this);
        editor.setListener(this);
        editor.setImage(px, w, h);
        root.addView(editor, new LinearLayout.LayoutParams(-1, 0, 1));

        hint = Ui.text(this, "", 12.5f, Ui.TEXT_2, false);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(16), dp(8), dp(16), 0);
        root.addView(hint);

        options = new FrameLayout(this);
        options.setPadding(dp(12), dp(8), dp(12), dp(4));
        root.addView(options, new LinearLayout.LayoutParams(-1, -2));
        root.addView(tabBar());

        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
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
                root.setPadding(left, top, right, bottom);
                return in;
            }
        });
        setContentView(root);
        showTab(TAB_CROP);
        updateUndo();
    }

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    @Override
    public void onBackPressed() {
        cancel();
    }

    private void cancel() {
        Intent data = new Intent();
        putColors(data);
        setResult(RESULT_CANCELED, data);
        finish();
    }

    private void putColors(Intent data) {
        int[] out = new int[picked.size()];
        int i = 0;
        for (int c : picked) out[i++] = c;
        data.putExtra(RESULT_COLORS, out);
    }

    // ---- layout ---------------------------------------------------------------------------------

    private View topBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(6), dp(6), dp(10), dp(6));
        IconButton close = new IconButton(this, Icons.CLOSE, 44, 20, "Cancel");
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                cancel();
            }
        });
        bar.addView(close);
        TextView title = Ui.text(this, "Edit picture", 17, Ui.TEXT, true);
        title.setPadding(dp(6), 0, 0, 0);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        undoBtn = new IconButton(this, Icons.UNDO, 44, 22, "Undo cut-out");
        undoBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.undo();
            }
        });
        bar.addView(undoBtn);
        TextView done = Ui.chip(this, "Done", true);
        done.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                done();
            }
        });
        LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(-2, -2);
        dl.setMargins(dp(8), 0, 0, 0);
        bar.addView(done, dl);
        return bar;
    }

    private View tabBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER);
        bar.setPadding(dp(12), dp(8), dp(12), dp(12));
        String[] names = {"Crop", "Cut out", "Colours"};
        for (int i = 0; i < names.length; i++) {
            final int k = i;
            TextView t = Ui.chip(this, names[i], false);
            t.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showTab(k);
                }
            });
            tabs.add(t);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(i == 0 ? 0 : dp(8), 0, 0, 0);
            bar.addView(t, lp);
        }
        return bar;
    }

    private void showTab(int tab) {
        for (int i = 0; i < tabs.size(); i++) Ui.styleChip(tabs.get(i), i == tab);
        options.removeAllViews();
        if (tab == TAB_CROP) cropOptions();
        else if (tab == TAB_CUT) cutOptions();
        else colourOptions();
    }

    private HorizontalScrollView chipRow(List<TextView> chips) {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        for (int i = 0; i < chips.size(); i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.setMargins(i == 0 ? 0 : dp(6), 0, 0, 0);
            row.addView(chips.get(i), lp);
        }
        scroll.addView(row);
        return scroll;
    }

    private void cropOptions() {
        editor.setMode(ImageEditView.CROP);
        hint.setText("Drag the corners or edges to crop. Two fingers zoom in.");
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        final List<TextView> chips = new ArrayList<>();
        final float[] ratios = {0, originalAspect, 1f, 4f / 3f, 3f / 4f, 16f / 9f};
        for (int i = 0; i < ASPECT_NAMES.length; i++) {
            final int k = i;
            final TextView c = Ui.chip(this, ASPECT_NAMES[i], i == 0);
            c.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    for (TextView o : chips) Ui.styleChip(o, o == c);
                    editor.setAspect(ratios[k]);
                }
            });
            chips.add(c);
        }
        col.addView(chipRow(chips));
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        IconButton rotate = new IconButton(this, Icons.ROTATE, 48, 24, "Rotate");
        rotate.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.rotate();
            }
        });
        IconButton flip = new IconButton(this, Icons.FLIP, 48, 24, "Flip");
        flip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.flip();
            }
        });
        TextView reset = Ui.chip(this, "Reset crop", false);
        reset.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.resetCrop();
                for (TextView o : chips) Ui.styleChip(o, o == chips.get(0));
            }
        });
        actions.addView(rotate);
        actions.addView(flip);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-2, -2);
        rp.setMargins(dp(10), 0, 0, 0);
        actions.addView(reset, rp);
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1, -2);
        ap.setMargins(0, dp(8), 0, 0);
        col.addView(actions, ap);
        options.addView(col);
    }

    private void cutOptions() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        final List<TextView> chips = new ArrayList<>();
        final TextView auto = Ui.chip(this, "✨ Auto remove", false);
        final TextView wand = Ui.chip(this, "Magic wand", false);
        final TextView erase = Ui.chip(this, "Erase", false);
        final TextView restore = Ui.chip(this, "Restore", false);
        final TextView all = Ui.chip(this, "Restore all", false);
        chips.add(auto);
        chips.add(wand);
        chips.add(erase);
        chips.add(restore);
        chips.add(all);
        col.addView(chipRow(chips));

        final TextView label = Ui.text(this, "", 13, Ui.TEXT_2, true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(4), dp(10), 0, 0);
        col.addView(label, lp);
        final Slider slider = new Slider(this);
        col.addView(slider, new LinearLayout.LayoutParams(-1, -2));

        final Runnable modeChanged = new Runnable() {
            @Override
            public void run() {
                int m = editor.mode();
                Ui.styleChip(wand, m == ImageEditView.WAND);
                Ui.styleChip(erase, m == ImageEditView.ERASE);
                Ui.styleChip(restore, m == ImageEditView.RESTORE);
                boolean brush = m == ImageEditView.ERASE || m == ImageEditView.RESTORE;
                label.setText(brush ? "Brush size" : "How alike colours must be");
                slider.setValue(brush ? brushValue : editor.tolerance());
                hint.setText(m == ImageEditView.WAND ? "Tap an area to remove it, like a patch of sky or a wall."
                        : m == ImageEditView.ERASE ? "Rub out anything you don't want. Two fingers zoom in for detail."
                        : "Paint back anything that was removed by mistake.");
            }
        };
        slider.setListener(new Slider.Listener() {
            @Override
            public void onChange(float v, boolean done) {
                int m = editor.mode();
                if (m == ImageEditView.ERASE || m == ImageEditView.RESTORE) {
                    brushValue = v;
                    editor.setBrushDp(6 + v * 54);
                } else {
                    editor.setTolerance(v);
                }
            }
        });
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Ui.press(v);
                if (!editor.autoRemove()) {
                    Toast.makeText(ImageEditActivity.this, "No plain background found. Try the magic wand.", Toast.LENGTH_SHORT).show();
                }
            }
        });
        wand.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.setMode(ImageEditView.WAND);
                modeChanged.run();
            }
        });
        erase.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.setMode(ImageEditView.ERASE);
                modeChanged.run();
            }
        });
        restore.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.setMode(ImageEditView.RESTORE);
                modeChanged.run();
            }
        });
        all.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                editor.restoreAll();
            }
        });
        int m = editor.mode();
        if (m != ImageEditView.WAND && m != ImageEditView.ERASE && m != ImageEditView.RESTORE) editor.setMode(ImageEditView.WAND);
        modeChanged.run();
        hint.setText("Auto remove takes away a plain background. The wand removes what you tap.");
        options.addView(col);
    }

    private float brushValue = 0.37f;

    private void colourOptions() {
        editor.setMode(ImageEditView.PICK);
        hint.setText("Drag over the picture to pick any colour, or tap one of its main colours.");
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView l = Ui.text(this, "Main colours", 13, Ui.TEXT_2, true);
        l.setPadding(dp(4), 0, 0, dp(4));
        col.addView(l);
        int[] crop = editor.cropRect();
        int[] cut = ImageOps.cutOut(editor.pixels(), editor.width(), editor.mask(), crop[0], crop[1], crop[2], crop[3]);
        byte[] alphaMask = new byte[cut.length];
        for (int i = 0; i < cut.length; i++) alphaMask[i] = (byte) (cut[i] >>> 24);
        int[] main = ImageOps.dominantColors(cut, crop[2], crop[3], alphaMask, 7);
        FlowLayout flow = new FlowLayout(this, 4, 4);
        for (final int c : main) {
            Swatch s = new Swatch(this, c, false);
            s.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    onPicked(c);
                }
            });
            flow.addView(s);
        }
        col.addView(flow);
        options.addView(col);
    }

    // ---- callbacks ------------------------------------------------------------------------------

    @Override
    public void onPicked(int rgb) {
        picked.remove(rgb | 0xFF000000);
        picked.add(rgb | 0xFF000000);
        hint.setText(String.format("Added #%06X to your colours. Pick more, or tap Done.", rgb & 0xFFFFFF));
        hint.setTextColor(0xFF000000 | rgb);
        main.removeCallbacks(resetHintColour);
        main.postDelayed(resetHintColour, 2500);
    }

    private final Runnable resetHintColour = new Runnable() {
        @Override
        public void run() {
            hint.setTextColor(Ui.TEXT_2);
        }
    };

    @Override
    public void onChanged() {
        updateUndo();
    }

    private void updateUndo() {
        undoBtn.setDim(!editor.canUndo());
    }

    // ---- saving ---------------------------------------------------------------------------------

    private void done() {
        if (saving) return;
        final Intent data = new Intent();
        putColors(data);
        if (!editor.edited()) {
            data.putExtra(RESULT_NAME, source.getName());
            data.putExtra(RESULT_W, editor.width());
            data.putExtra(RESULT_H, editor.height());
            setResult(RESULT_OK, data);
            finish();
            return;
        }
        saving = true;
        final int[] c = editor.cropRect();
        final int[] px = editor.pixels();
        final byte[] mask = editor.mask();
        final int w = editor.width();
        final boolean turned = editor.turned();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    int[] out = ImageOps.cutOut(px, w, mask, c[0], c[1], c[2], c[3]);
                    boolean alpha = ImageOps.anyTransparent(out);
                    Bitmap b = Bitmap.createBitmap(out, c[2], c[3], Bitmap.Config.ARGB_8888);
                    String name = BoardStore.newId() + (alpha ? ".png" : ".jpg");
                    File f = new File(source.getParentFile(), name);
                    try (OutputStream os = new FileOutputStream(f)) {
                        b.compress(alpha ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 92, os);
                    }
                    b.recycle();
                    data.putExtra(RESULT_NAME, name);
                    data.putExtra(RESULT_W, c[2]);
                    data.putExtra(RESULT_H, c[3]);
                    data.putExtra(RESULT_CROP_X, (float) c[0]);
                    data.putExtra(RESULT_CROP_Y, (float) c[1]);
                    data.putExtra(RESULT_TURNED, turned);
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            setResult(RESULT_OK, data);
                            finish();
                        }
                    });
                } catch (IOException | RuntimeException | OutOfMemoryError e) {
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            saving = false;
                            Toast.makeText(ImageEditActivity.this, "Couldn't save the picture", Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }).start();
    }
}
