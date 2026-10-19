package com.infinink.app.render;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Typeface;

import com.infinink.app.model.Note;

import java.util.HashMap;
import java.util.Map;

/**
 * The fonts text can use: the phone's own families plus free fonts bundled in assets/fonts (SIL
 * Open Font License or Apache 2.0; their licences are in assets/fonts/licenses). A note stores a
 * font id ("" for the default); unknown ids fall back to the default so old boards still open.
 */
public final class Fonts {
    public static final class Font {
        public final String id, name, group;

        Font(String id, String name, String group) {
            this.id = id;
            this.name = name;
            this.group = group;
        }
    }

    /** In the order the picker shows them. "sys:" ids are system families, others asset files. */
    public static final Font[] ALL = {
            new Font("", "Sans", "Clean"),
            new Font("sys:sans-serif-light", "Sans Light", "Clean"),
            new Font("sys:sans-serif-thin", "Sans Thin", "Clean"),
            new Font("sys:sans-serif-medium", "Sans Medium", "Clean"),
            new Font("sys:sans-serif-black", "Sans Black", "Clean"),
            new Font("sys:sans-serif-condensed", "Condensed", "Clean"),
            new Font("Poppins", "Poppins", "Clean"),
            new Font("Nunito", "Nunito", "Clean"),
            new Font("Quicksand", "Quicksand", "Clean"),
            new Font("Comfortaa", "Comfortaa", "Clean"),
            new Font("Fredoka", "Fredoka", "Clean"),
            new Font("Oswald", "Oswald", "Clean"),
            new Font("Caveat", "Caveat", "Handwriting"),
            new Font("PatrickHand", "Patrick Hand", "Handwriting"),
            new Font("IndieFlower", "Indie Flower", "Handwriting"),
            new Font("ShadowsIntoLight", "Shadows Into Light", "Handwriting"),
            new Font("ArchitectsDaughter", "Architects Daughter", "Handwriting"),
            new Font("GochiHand", "Gochi Hand", "Handwriting"),
            new Font("PermanentMarker", "Permanent Marker", "Handwriting"),
            new Font("HomemadeApple", "Homemade Apple", "Handwriting"),
            new Font("AmaticSC", "Amatic SC", "Handwriting"),
            new Font("sys:casual", "Casual", "Handwriting"),
            new Font("DancingScript", "Dancing Script", "Script"),
            new Font("Pacifico", "Pacifico", "Script"),
            new Font("Sacramento", "Sacramento", "Script"),
            new Font("Lobster", "Lobster", "Script"),
            new Font("sys:serif", "Serif", "Classic"),
            new Font("PlayfairDisplay", "Playfair Display", "Classic"),
            new Font("Lora", "Lora", "Classic"),
            new Font("DMSerifDisplay", "DM Serif Display", "Classic"),
            new Font("Cinzel", "Cinzel", "Classic"),
            new Font("AbrilFatface", "Abril Fatface", "Classic"),
            new Font("BebasNeue", "Bebas Neue", "Display"),
            new Font("Righteous", "Righteous", "Display"),
            new Font("Bangers", "Bangers", "Display"),
            new Font("Bungee", "Bungee", "Display"),
            new Font("Shrikhand", "Shrikhand", "Display"),
            new Font("RubikBubbles", "Rubik Bubbles", "Display"),
            new Font("Monoton", "Monoton", "Display"),
            new Font("Creepster", "Creepster", "Display"),
            new Font("PressStart2P", "Press Start 2P", "Display"),
            new Font("Silkscreen", "Silkscreen", "Display"),
            new Font("sys:sans-serif-smallcaps", "Small Caps", "Display"),
            new Font("SpecialElite", "Special Elite", "Typewriter"),
            new Font("CourierPrime", "Courier Prime", "Typewriter"),
            new Font("SpaceMono", "Space Mono", "Typewriter"),
            new Font("sys:monospace", "Monospace", "Typewriter"),
    };

    private static AssetManager assets;
    private static final Map<String, Typeface> cache = new HashMap<>();

    private Fonts() {}

    public static void init(Context c) {
        if (assets == null) assets = c.getApplicationContext().getAssets();
    }

    public static Font find(String id) {
        for (Font f : ALL) if (f.id.equals(id)) return f;
        return ALL[0];
    }

    /** The typeface for a font id with the note's bold/italic. Safe from any thread. */
    public static synchronized Typeface typeface(String id, int fmt) {
        String key = id + "#" + (fmt & (Note.BOLD | Note.ITALIC));
        Typeface t = cache.get(key);
        if (t != null) return t;
        Typeface base = base(id == null ? "" : id);
        int style = ((fmt & Note.BOLD) != 0 ? Typeface.BOLD : 0) | ((fmt & Note.ITALIC) != 0 ? Typeface.ITALIC : 0);
        t = style == 0 ? base : Typeface.create(base, style);
        cache.put(key, t);
        return t;
    }

    private static Typeface base(String id) {
        if (id.isEmpty()) return Typeface.DEFAULT;
        if (id.startsWith("sys:")) return Typeface.create(id.substring(4), Typeface.NORMAL);
        if (assets != null) {
            try {
                return Typeface.createFromAsset(assets, "fonts/" + id + ".ttf");
            } catch (RuntimeException ignored) {
                // A missing or broken file: use the default rather than crash.
            }
        }
        return Typeface.DEFAULT;
    }
}
