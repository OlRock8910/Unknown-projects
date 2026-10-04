package com.strobeglyph.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.strobeglyph.app.engine.PatternType;
import com.strobeglyph.app.engine.ScreenColor;
import com.strobeglyph.app.engine.Settings;
import com.strobeglyph.app.engine.TapTempo;
import com.strobeglyph.app.glyph.GlyphEffect;
import com.strobeglyph.app.glyph.GlyphLights;
import com.strobeglyph.app.glyph.GlyphModel;
import com.strobeglyph.app.output.AudioBeatSource;
import com.strobeglyph.app.output.TorchController;
import com.strobeglyph.app.ui.Chip;
import com.strobeglyph.app.ui.FlashView;
import com.strobeglyph.app.ui.FlowLayout;
import com.strobeglyph.app.ui.GlowOrb;
import com.strobeglyph.app.ui.LabeledSlider;
import com.strobeglyph.app.ui.Ui;

import java.util.Locale;

/** The one screen of the app. */
public final class MainActivity extends Activity
        implements ShowController.Listener, GlyphLights.Listener {

    private static final int REQ_CAMERA = 1;
    private static final int REQ_MIC = 2;

    private static final String ADB_COMMAND = "adb shell settings put global nt_glyph_interface_debug_enable 1";
    private static final int[] TIMER_SECONDS = {0, 10, 30, 60, 300, 600};
    private static final String[] TIMER_LABELS = {"Off", "10 s", "30 s", "1 min", "5 min", "10 min"};

    private static final String WARNING =
            "Flashing lights can trigger seizures in people with photosensitive epilepsy, and can cause "
                    + "headaches, nausea or disorientation in others.\n\n"
                    + "Don't use this app if you or anyone nearby is sensitive to flashing lights, and never "
                    + "shine the flash into someone's eyes. Stop straight away if you feel unwell.\n\n"
                    + "Running the flash flat out for a long time can also make the phone warm.";

    private static final String GLYPH_HELP =
            "Nothing only lets apps drive the Glyph lights after a switch is flipped. On Nothing OS 4 "
                    + "(Android 16) this app should connect by itself. If it says access is off, connect the "
                    + "phone to a computer with USB debugging on and run this once:";
    private static final String GLYPH_HELP_FOOT =
            "It stays on for 48 hours, then you run it again. The Glyph lights only work while this app "
                    + "is on screen.";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final TapTempo tapTempo = new TapTempo();

    private Settings settings;
    private Prefs prefs;
    private TorchController torch;
    private GlyphLights glyph;
    private AudioBeatSource audio;
    private ShowController show;
    private FlashView flash;
    private long runStartedAt;

    // layout
    private FrameLayout root;
    private ScrollView scroll;
    private LinearLayout content;
    private LinearLayout bar;
    private GlowOrb orb;
    private TextView startButton;
    private TextView statusTitle;
    private TextView statusDetail;

    // controls
    private LabeledSlider speed;
    private LabeledSlider flashLength;
    private LabeledSlider torchLevel;
    private Chip[] patternChips;
    private TextView patternBlurb;
    private LinearLayout morseBox;
    private Chip torchChip;
    private Chip screenChip;
    private Chip glyphChip;
    private TextView noFlashNote;
    private FlowLayout colorRow;
    private Chip[] colorChips;
    private Chip[] timerChips;

    // glyph card
    private LinearLayout glyphCard;
    private TextView glyphStatus;
    private Chip[] effectChips;
    private TextView effectBlurb;
    private LabeledSlider glyphLevel;
    private LabeledSlider glyphSpeed;
    private Chip testChip;
    private LinearLayout glyphHelp;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (show.isRunning()) {
                renderStatus();
                main.postDelayed(this, 200);
            }
        }
    };

    // ---- lifecycle --------------------------------------------------------------------

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        settings = new Settings();
        prefs = new Prefs(this);
        prefs.load(settings);

        torch = new TorchController(this, main);
        GlyphModel model = GlyphModel.detect(Build.MANUFACTURER, Build.MODEL);
        if (model != null && GlyphLights.supportedHere()) {
            glyph = new GlyphLights(this, main, model, this);
        }
        if (!torch.isAvailable() && glyph == null) {
            settings.screen = true; // nothing else can flash on this phone
        }
        audio = new AudioBeatSource(main);
        flash = new FlashView(this, settings);
        show = new ShowController(main, settings, torch, glyph, flash, audio, this);

        buildUi(model);
        syncUi();
        if (!prefs.warningAccepted()) {
            showWarning(true);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (glyph != null) {
            glyph.connect();
        }
    }

    @Override
    protected void onStop() {
        // Flashing lights must never carry on unseen, and the Glyph SDK only works in the foreground.
        show.stop();
        if (glyph != null) {
            glyph.disconnect();
        }
        prefs.save(settings);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        show.stop();
        audio.stop();
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isSpeedKey(keyCode)) {
            nudgeSpeed(keyCode == KeyEvent.KEYCODE_VOLUME_UP ? 1 : -1);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        return isSpeedKey(keyCode) || super.onKeyUp(keyCode, event);
    }

    /** While flashing, the volume keys change the speed instead of the volume. */
    private boolean isSpeedKey(int keyCode) {
        return show.isRunning() && settings.pattern.usesSpeed()
                && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN);
    }

    // ---- building the screen ----------------------------------------------------------

    private void buildUi(GlyphModel model) {
        root = new FrameLayout(this);
        root.setBackgroundColor(Ui.BG);

        scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        buildHeader();
        buildHero();
        buildSpeedCard();
        buildPatternCard();
        buildOutputsCard();
        buildTimerCard();
        buildGlyphCard(model);
        buildFooter();

        buildBottomBar();
        root.addView(flash, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        flash.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                show.stop();
            }
        });

        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int l;
                int t;
                int r;
                int b;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets bars = in.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
                    l = bars.left;
                    t = bars.top;
                    r = bars.right;
                    b = Math.max(bars.bottom, ime.bottom);
                } else {
                    l = in.getSystemWindowInsetLeft();
                    t = in.getSystemWindowInsetTop();
                    r = in.getSystemWindowInsetRight();
                    b = in.getSystemWindowInsetBottom();
                }
                applyInsets(l, t, r, b);
                return in;
            }
        });
        applyInsets(0, 0, 0, 0);
        setContentView(root);
    }

    private void applyInsets(int left, int top, int right, int bottom) {
        int side = Ui.dp(this, 16);
        content.setPadding(side + left, top + Ui.dp(this, 12), side + right, bottom + Ui.dp(this, 112));
        bar.setPadding(side + left, Ui.dp(this, 28), side + right, bottom + Ui.dp(this, 14));
    }

    private void addCard(LinearLayout card) {
        content.addView(card, Ui.linear(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, 0, 0, 0, Ui.dp(this, 12)));
    }

    private LinearLayout.LayoutParams stackParams(int topDp) {
        return Ui.linear(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                0, Ui.dp(this, topDp), 0, 0);
    }

    private void buildHeader() {
        LinearLayout header = Ui.row(this);
        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        TextView title = Ui.text(this, "STROBE", 26, Ui.TEXT);
        title.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        title.setLetterSpacing(0.24f);
        titles.addView(title);
        TextView sub = Ui.text(this, "torch  ·  screen  ·  glyph", 12.5f, Ui.DIM);
        sub.setLetterSpacing(0.08f);
        titles.addView(sub, Ui.linear(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, 0, Ui.dp(this, 4), 0, 0));
        header.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView info = Ui.text(this, "i", 17, Ui.DIM);
        info.setTypeface(Ui.medium());
        info.setGravity(Gravity.CENTER);
        info.setBackground(Ui.rippled(Ui.rect(this, Ui.SURFACE, 20, Ui.STROKE, 1)));
        info.setContentDescription("Safety information");
        info.setClickable(true);
        info.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showWarning(false);
            }
        });
        header.addView(info, new LinearLayout.LayoutParams(Ui.dp(this, 40), Ui.dp(this, 40)));
        content.addView(header, stackParams(0));
    }

    private void buildHero() {
        orb = new GlowOrb(this);
        orb.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggle();
            }
        });
        content.addView(orb, Ui.linear(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, 0, Ui.dp(this, 8), 0, Ui.dp(this, 8)));
    }

    private void buildSpeedCard() {
        LinearLayout card = Ui.card(this);

        speed = new LabeledSlider(this, "Speed", Ui.ACCENT);
        speed.configure(Settings.MIN_HZ, Settings.MAX_HZ, true, new LabeledSlider.Formatter() {
            @Override
            public String format(float v) {
                return hz(v) + " Hz";
            }
        });
        speed.setListener(new LabeledSlider.Listener() {
            @Override
            public void onValueChanged(float v) {
                settings.setHz(v);
                renderStatus();
            }
        });
        card.addView(speed);

        LinearLayout buttons = Ui.row(this);
        buttons.addView(button("−", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                nudgeSpeed(-1);
            }
        }), weighted(0, 0.7f));
        buttons.addView(button("+", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                nudgeSpeed(1);
            }
        }), weighted(8, 0.7f));
        buttons.addView(button("Tap tempo", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                float tapped = tapTempo.tap(System.nanoTime());
                if (tapped > 0f && settings.pattern.usesSpeed()) {
                    settings.setHz(tapped);
                    speed.setValue(settings.hz);
                    renderStatus();
                }
            }
        }), weighted(8, 1.6f));
        card.addView(buttons, stackParams(6));

        flashLength = new LabeledSlider(this, "Flash length", Ui.MAGENTA);
        flashLength.configure(Settings.MIN_DUTY * 100f, Settings.MAX_DUTY * 100f, false, percent());
        flashLength.setListener(new LabeledSlider.Listener() {
            @Override
            public void onValueChanged(float v) {
                settings.duty = Settings.clampDuty(v / 100f);
            }
        });
        card.addView(flashLength, stackParams(18));

        torchLevel = new LabeledSlider(this, "Torch brightness", Ui.WARN);
        torchLevel.configure(5, 100, false, percent());
        torchLevel.setListener(new LabeledSlider.Listener() {
            @Override
            public void onValueChanged(float v) {
                settings.torchPercent = Math.round(v);
            }
        });
        card.addView(torchLevel, stackParams(18));
        addCard(card);
    }

    private void buildPatternCard() {
        LinearLayout card = Ui.card(this);
        card.addView(Ui.sectionTitle(this, "Pattern"));
        FlowLayout flow = new FlowLayout(this, 8);
        PatternType[] types = PatternType.values();
        patternChips = new Chip[types.length];
        for (int i = 0; i < types.length; i++) {
            final PatternType type = types[i];
            Chip chip = new Chip(this, type.label);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    choosePattern(type);
                }
            });
            patternChips[i] = chip;
            flow.addView(chip);
        }
        card.addView(flow, stackParams(12));

        patternBlurb = Ui.text(this, "", 12.5f, Ui.DIM);
        card.addView(patternBlurb, stackParams(12));

        morseBox = new LinearLayout(this);
        morseBox.setOrientation(LinearLayout.VERTICAL);
        EditText morse = new EditText(this);
        morse.setHint("Type a message");
        morse.setHintTextColor(Ui.FAINT);
        morse.setTextColor(Ui.TEXT);
        morse.setTextSize(16);
        morse.setSingleLine();
        morse.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        morse.setFilters(new InputFilter[] {new InputFilter.AllCaps(),
                new InputFilter.LengthFilter(Settings.MAX_MORSE_CHARS)});
        morse.setText(settings.morseText);
        morse.setBackground(Ui.rect(this, Ui.SURFACE_HI, 14, Ui.STROKE, 1));
        morse.setPadding(Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12));
        morse.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {
            }

            @Override
            public void onTextChanged(CharSequence s, int a, int b, int c) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                String text = s.toString().trim();
                settings.morseText = text.isEmpty() ? "SOS" : text;
            }
        });
        morseBox.addView(morse);
        morseBox.addView(Ui.text(this, "Letters and numbers only. Dots are short flashes, dashes are long.",
                12, Ui.FAINT), stackParams(8));
        card.addView(morseBox, stackParams(14));
        addCard(card);
    }

    private void buildOutputsCard() {
        LinearLayout card = Ui.card(this);
        card.addView(Ui.sectionTitle(this, "Flash with"));

        LinearLayout tiles = Ui.row(this);
        torchChip = tile("Torch", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                settings.torch = !settings.torch;
                outputsChanged();
            }
        });
        screenChip = tile("Screen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                settings.screen = !settings.screen;
                outputsChanged();
            }
        });
        tiles.addView(torchChip, weighted(0, 1f));
        tiles.addView(screenChip, weighted(8, 1f));
        if (glyph != null) {
            glyphChip = tile("Glyph", new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    settings.glyph = !settings.glyph;
                    outputsChanged();
                }
            });
            tiles.addView(glyphChip, weighted(8, 1f));
        }
        card.addView(tiles, stackParams(12));

        noFlashNote = Ui.text(this, "No flash found on this phone, so Torch is unavailable.", 12.5f, Ui.WARN);
        card.addView(noFlashNote, stackParams(10));

        colorRow = new FlowLayout(this, 8);
        ScreenColor[] colors = ScreenColor.values();
        colorChips = new Chip[colors.length];
        for (int i = 0; i < colors.length; i++) {
            final ScreenColor color = colors[i];
            Chip chip = new Chip(this, color.label, Ui.MAGENTA);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    settings.screenColor = color;
                    syncUi();
                }
            });
            colorChips[i] = chip;
            colorRow.addView(chip);
        }
        card.addView(colorRow, stackParams(12));
        addCard(card);
    }

    private void buildTimerCard() {
        LinearLayout card = Ui.card(this);
        card.addView(Ui.sectionTitle(this, "Auto-stop"));
        FlowLayout flow = new FlowLayout(this, 8);
        timerChips = new Chip[TIMER_SECONDS.length];
        for (int i = 0; i < TIMER_SECONDS.length; i++) {
            final int seconds = TIMER_SECONDS[i];
            Chip chip = new Chip(this, TIMER_LABELS[i]);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    settings.timerSeconds = seconds;
                    show.restartTimer();
                    syncUi();
                }
            });
            timerChips[i] = chip;
            flow.addView(chip);
        }
        card.addView(flow, stackParams(12));
        addCard(card);
    }

    private void buildGlyphCard(GlyphModel model) {
        glyphCard = Ui.card(this);
        LinearLayout head = Ui.row(this);
        head.addView(Ui.sectionTitle(this, "Nothing Glyph"),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        if (model != null) {
            head.addView(Ui.text(this, model.label, 13, Ui.DIM));
        }
        glyphCard.addView(head);

        if (glyph == null) {
            String why = model == null
                    ? "This isn't a Nothing phone, so there are no Glyph lights to control. Torch and Screen work everywhere."
                    : "Glyph control needs Android 14 or newer on your " + model.label + ".";
            glyphCard.addView(Ui.text(this, why, 13.5f, Ui.DIM), stackParams(10));
            addCard(glyphCard);
            return;
        }

        glyphStatus = Ui.text(this, "", 14, Ui.TEXT);
        glyphStatus.setTypeface(Ui.medium());
        glyphCard.addView(glyphStatus, stackParams(10));

        FlowLayout effects = new FlowLayout(this, 8);
        GlyphEffect[] all = GlyphEffect.values();
        effectChips = new Chip[all.length];
        for (int i = 0; i < all.length; i++) {
            final GlyphEffect effect = all[i];
            Chip chip = new Chip(this, effect.label, Ui.OK);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    settings.glyphEffect = effect;
                    syncUi();
                    show.refresh();
                }
            });
            effectChips[i] = chip;
            effects.addView(chip);
        }
        glyphCard.addView(effects, stackParams(14));
        effectBlurb = Ui.text(this, "", 12.5f, Ui.DIM);
        glyphCard.addView(effectBlurb, stackParams(10));

        glyphLevel = new LabeledSlider(this, "Glyph brightness", Ui.OK);
        glyphLevel.configure(5, 100, false, percent());
        glyphLevel.setListener(new LabeledSlider.Listener() {
            @Override
            public void onValueChanged(float v) {
                settings.glyphPercent = Math.round(v);
            }
        });
        glyphCard.addView(glyphLevel, stackParams(16));

        glyphSpeed = new LabeledSlider(this, "Effect speed", Ui.OK);
        glyphSpeed.configure(Settings.MIN_HZ, Settings.MAX_HZ, true, new LabeledSlider.Formatter() {
            @Override
            public String format(float v) {
                return hz(v) + " Hz";
            }
        });
        glyphSpeed.setListener(new LabeledSlider.Listener() {
            @Override
            public void onValueChanged(float v) {
                settings.glyphHz = Settings.clampHz(v);
            }
        });
        glyphCard.addView(glyphSpeed, stackParams(16));

        LinearLayout buttons = Ui.row(this);
        testChip = button("Test the lights", Ui.OK, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                show.testGlyph();
            }
        });
        buttons.addView(testChip, weighted(0, 1f));
        buttons.addView(button("Setup help", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Ui.show(glyphHelp, glyphHelp.getVisibility() != View.VISIBLE);
            }
        }), weighted(8, 1f));
        glyphCard.addView(buttons, stackParams(16));

        glyphHelp = new LinearLayout(this);
        glyphHelp.setOrientation(LinearLayout.VERTICAL);
        glyphHelp.addView(Ui.text(this, GLYPH_HELP, 12.5f, Ui.DIM));
        TextView command = Ui.text(this, ADB_COMMAND, 12.5f, Ui.ACCENT);
        command.setTypeface(Typeface.MONOSPACE);
        command.setTextIsSelectable(true);
        command.setBackground(Ui.rect(this, Ui.SURFACE_HI, 12, Ui.STROKE, 1));
        command.setPadding(Ui.dp(this, 12), Ui.dp(this, 10), Ui.dp(this, 12), Ui.dp(this, 10));
        glyphHelp.addView(command, stackParams(10));
        glyphHelp.addView(button("Copy command", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("adb command", ADB_COMMAND));
                    toast("Copied");
                }
            }
        }), stackParams(10));
        glyphHelp.addView(Ui.text(this, GLYPH_HELP_FOOT, 12.5f, Ui.DIM), stackParams(10));
        glyphHelp.setVisibility(View.GONE);
        glyphCard.addView(glyphHelp, stackParams(14));
        addCard(glyphCard);
    }

    private void buildFooter() {
        TextView foot = Ui.text(this, "Flashing lights can trigger seizures. Use responsibly.", 12, Ui.FAINT);
        foot.setGravity(Gravity.CENTER);
        content.addView(foot, stackParams(6));
    }

    private void buildBottomBar() {
        bar = Ui.row(this);
        GradientDrawable fade = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {Ui.withAlpha(Ui.BG, 0), Ui.withAlpha(Ui.BG, 245), Ui.BG, Ui.BG});
        bar.setBackground(fade);

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        statusTitle = Ui.text(this, "Ready", 17, Ui.TEXT);
        statusTitle.setTypeface(Ui.medium());
        statusDetail = Ui.text(this, "", 12.5f, Ui.DIM);
        text.addView(statusTitle);
        text.addView(statusDetail, stackParams(3));
        bar.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        startButton = Ui.text(this, "START", 16, Ui.ON_ACCENT);
        startButton.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        startButton.setLetterSpacing(0.14f);
        startButton.setGravity(Gravity.CENTER);
        startButton.setClickable(true);
        startButton.setFocusable(true);
        startButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggle();
            }
        });
        bar.addView(startButton, new LinearLayout.LayoutParams(Ui.dp(this, 150), Ui.dp(this, 56)));
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
    }

    // ---- small builders ---------------------------------------------------------------

    private Chip button(String label, View.OnClickListener l) {
        return button(label, Ui.ACCENT, l);
    }

    private Chip button(String label, int accent, View.OnClickListener l) {
        Chip chip = new Chip(this, label, accent);
        chip.setOnClickListener(l);
        return chip;
    }

    private Chip tile(String label, View.OnClickListener l) {
        Chip chip = new Chip(this, label);
        chip.setTextSize(15);
        chip.setPadding(Ui.dp(this, 8), Ui.dp(this, 16), Ui.dp(this, 8), Ui.dp(this, 16));
        chip.setOnClickListener(l);
        return chip;
    }

    private LinearLayout.LayoutParams weighted(int leftMarginDp, float weight) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight);
        p.leftMargin = Ui.dp(this, leftMarginDp);
        return p;
    }

    private static LabeledSlider.Formatter percent() {
        return new LabeledSlider.Formatter() {
            @Override
            public String format(float v) {
                return Math.round(v) + "%";
            }
        };
    }

    private static String hz(float v) {
        return String.format(Locale.US, v < 10f ? "%.1f" : "%.0f", v);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    // ---- actions ----------------------------------------------------------------------

    private void toggle() {
        if (show.isRunning()) {
            show.stop();
        } else {
            show.start();
        }
    }

    private void nudgeSpeed(int direction) {
        if (!settings.pattern.usesSpeed()) {
            return;
        }
        float hz = settings.hz;
        float step = hz < 5f ? 0.5f : hz < 20f ? 1f : 2f;
        settings.setHz(hz + direction * step);
        speed.setValue(settings.hz);
        renderStatus();
    }

    private void choosePattern(PatternType type) {
        if (type == PatternType.BEAT
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        settings.selectPattern(type);
        syncUi();
        show.refresh();
    }

    private void outputsChanged() {
        syncUi();
        applyWindowState();
        show.refresh();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_MIC) {
            if (granted) {
                choosePattern(PatternType.BEAT);
            } else {
                toast("Beat mode needs the microphone to hear the music.");
            }
        } else if (code == REQ_CAMERA) {
            if (granted) {
                show.start();
            } else {
                toast("This phone needs camera permission to use its flash. Try Screen or Glyph instead.");
            }
        }
    }

    // ---- ShowController.Listener ------------------------------------------------------

    @Override
    public void onRunningChanged(boolean running) {
        if (running) {
            runStartedAt = SystemClock.elapsedRealtime();
            main.removeCallbacks(tick);
            main.post(tick);
        } else {
            main.removeCallbacks(tick);
        }
        applyWindowState();
        renderStatus();
    }

    @Override
    public void onMessage(String message) {
        toast(message);
        syncUi();
    }

    @Override
    public void onCameraPermissionNeeded() {
        requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_CAMERA);
    }

    // ---- GlyphLights.Listener ---------------------------------------------------------

    @Override
    public void onGlyphStatus(GlyphLights.Status status) {
        renderGlyph();
        if (status == GlyphLights.Status.NEEDS_SETUP || status == GlyphLights.Status.UNAVAILABLE) {
            Ui.show(glyphHelp, true);
        }
        if (status != GlyphLights.Status.READY) {
            show.refresh();
        }
        renderStatus();
    }

    // ---- keeping the screen in step with the state ------------------------------------

    /** Keeps the screen awake and bright while a show runs. */
    private void applyWindowState() {
        boolean running = show.isRunning();
        if (running) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = running && settings.screen
                ? 1f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
        getWindow().setAttributes(lp);
    }

    /** Copies every setting into the controls. Moving a slider does not call back into the settings. */
    private void syncUi() {
        PatternType pattern = settings.pattern;
        PatternType[] types = PatternType.values();
        for (int i = 0; i < types.length; i++) {
            patternChips[i].setChecked(types[i] == pattern);
        }
        patternBlurb.setText(pattern.blurb);
        speed.setEnabled(pattern.usesSpeed());
        speed.setValue(settings.hz);
        Ui.show(flashLength, pattern.usesDuty);
        flashLength.setValue(settings.duty * 100f);
        Ui.show(morseBox, pattern == PatternType.MORSE);

        boolean hasTorch = torch.isAvailable();
        torchChip.setEnabled(hasTorch);
        torchChip.setChecked(hasTorch && settings.torch);
        screenChip.setChecked(settings.screen);
        if (glyphChip != null) {
            glyphChip.setChecked(settings.glyph);
        }
        Ui.show(noFlashNote, !hasTorch);
        Ui.show(torchLevel, torch.supportsBrightness() && settings.torch);
        torchLevel.setValue(settings.torchPercent);

        Ui.show(colorRow, settings.screen);
        ScreenColor[] colors = ScreenColor.values();
        for (int i = 0; i < colors.length; i++) {
            colorChips[i].setChecked(colors[i] == settings.screenColor);
        }
        for (int i = 0; i < TIMER_SECONDS.length; i++) {
            timerChips[i].setChecked(TIMER_SECONDS[i] == settings.timerSeconds);
        }

        if (glyph != null) {
            GlyphEffect[] effects = GlyphEffect.values();
            for (int i = 0; i < effects.length; i++) {
                effectChips[i].setChecked(effects[i] == settings.glyphEffect);
            }
            effectBlurb.setText(settings.glyphEffect.blurb);
            glyphLevel.setValue(settings.glyphPercent);
            glyphSpeed.setValue(settings.glyphHz);
            Ui.show(glyphSpeed, settings.glyphEffect != GlyphEffect.SYNC);
            renderGlyph();
        }
        renderStatus();
    }

    private void renderGlyph() {
        if (glyph == null) {
            return;
        }
        String text;
        int color;
        switch (glyph.status()) {
            case READY:
                text = "●  Connected and ready";
                color = Ui.OK;
                break;
            case NEEDS_SETUP:
                text = "●  Glyph access is switched off";
                color = Ui.WARN;
                break;
            case UNAVAILABLE:
                text = "●  Glyph service not found";
                color = Ui.WARN;
                break;
            case ERROR:
                text = "●  Glyph error. Close and reopen the app.";
                color = Ui.DANGER;
                break;
            case CONNECTING:
            case IDLE:
            default:
                text = "●  Connecting…";
                color = Ui.DIM;
                break;
        }
        glyphStatus.setText(text);
        glyphStatus.setTextColor(color);
        testChip.setEnabled(glyph.isReady() && !show.isRunning());
    }

    private void renderStatus() {
        boolean running = show.isRunning();
        PatternType pattern = settings.pattern;

        String big;
        String unit;
        if (pattern == PatternType.TURBO) {
            big = "MAX";
            unit = "AS FAST AS POSSIBLE";
        } else {
            big = hz(settings.hz);
            unit = "HZ";
        }
        String caption = "TAP TO START";
        int captionColor = Ui.DIM;
        if (running) {
            long elapsed = SystemClock.elapsedRealtime() - runStartedAt;
            float actual = show.measuredHz();
            if (elapsed < 1300) {
                caption = "starting…";
            } else if (pattern == PatternType.STROBE && settings.hz >= 2f && actual < settings.hz * 0.85f) {
                caption = "flash limit \u2248 " + hz(actual) + " Hz";
                captionColor = Ui.WARN;
            } else if (pattern == PatternType.STROBE || pattern == PatternType.TURBO) {
                caption = "running at " + hz(actual) + " Hz";
                captionColor = Ui.OK;
            } else {
                caption = "flashing";
                captionColor = Ui.OK;
            }
        }
        orb.setReadout(running, big, unit, caption, captionColor);

        startButton.setText(running ? "STOP" : "START");
        startButton.setTextColor(running ? Color.WHITE : Ui.ON_ACCENT);
        startButton.setBackground(Ui.rippled(Ui.rect(this, running ? Ui.DANGER : Ui.ACCENT, 28, 0, 0)));

        statusTitle.setText(running ? "Flashing" : "Ready");
        statusTitle.setTextColor(running ? Ui.ACCENT : Ui.TEXT);
        StringBuilder detail = new StringBuilder(outputSummary());
        int left = show.secondsLeft();
        if (left >= 0) {
            detail.append("  ·  ").append(left).append(" s left");
        }
        statusDetail.setText(detail);
    }

    private String outputSummary() {
        StringBuilder sb = new StringBuilder();
        if (settings.torch && torch.isAvailable()) {
            sb.append("Torch");
        }
        if (settings.screen) {
            sb.append(sb.length() > 0 ? "  ·  " : "").append("Screen");
        }
        if (glyph != null && settings.glyph) {
            sb.append(sb.length() > 0 ? "  ·  " : "").append("Glyph");
            if (!glyph.isReady()) {
                sb.append(" (offline)");
            }
        }
        return sb.length() == 0 ? "Pick something to flash" : sb.toString();
    }

    // ---- safety information -----------------------------------------------------------

    private void showWarning(final boolean firstRun) {
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Before you flash")
                .setMessage(WARNING)
                .setCancelable(!firstRun);
        if (firstRun) {
            b.setPositiveButton("I understand", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface d, int which) {
                    prefs.acceptWarning();
                }
            });
            b.setNegativeButton("Exit", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface d, int which) {
                    finish();
                }
            });
        } else {
            b.setPositiveButton("OK", null);
        }
        b.show();
    }
}
