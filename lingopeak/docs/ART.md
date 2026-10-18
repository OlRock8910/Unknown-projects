# Art prompts (Gemini)

Each sheet is one image with 10 pictures in a 5 × 2 grid on magenta. Start
every prompt with the **style block**, then add the sheet's own text.

**Style block:**
> One image, a neat grid of 5 columns × 2 rows, 10 separate drawings, each
> centred in its own equal square cell with plenty of space around it. Solid
> flat magenta #FF00FF background everywhere, no shadows on the background, no
> borders, no grid lines, no text or letters anywhere. Style: modern flat 2D
> vector illustration, clean slightly thick dark navy outlines (#1B1D2A),
> simple shapes, soft flat shading. Palette mainly cobalt blue #2F5BEA,
> sunflower yellow #FFC531 and coral #FF5A4E, plus white, skin tones and navy.
> Friendly and charming, like a polished mobile game. It should not look like
> 3D, clay, glossy or AI art.

| Sheet | Saved as | Status |
|---|---|---|
| 1. The cast, standing | `art/sheets/cast-neutral.jpg` | ✅ done |
| 2. The cast, celebrating (upload sheet 1 and ask for the same characters jumping with arms up) | `art/sheets/cast-happy.jpg` | ✅ done |
| 3. The cast, confused (upload sheet 1 and ask for them scratching their heads) | `art/sheets/cast-confused.jpg` | ✅ done |
| 4. Mountain badges | `art/sheets/badges.jpg` | ✅ done |
| 5. The ten mountains | `art/sheets/mountains.jpg` | ✅ done |
| 6. Icons A: menu and rewards (5 × 3) | `art/sheets/icons-a.jpg` | ✅ done |
| 7. Icons B: practice and games (5 × 3) | `art/sheets/icons-b.jpg` | ✅ done |
| 8. Icons C: shop, settings and extras (5 × 3) | `art/sheets/icons-c.jpg` | ✅ done |
| 9. Avatar A: tops and trousers (5 × 4) | `art/sheets/avatar-a.jpg` | still to make |
| 10. Avatar B: hats and hair (5 × 3) | `art/sheets/avatar-b.jpg` | still to make |

The cast order is banana, shark, dinosaur, astronaut, penguin, bee, pizza,
knight, avocado and croissant. The mountain order is Snowdon, Ben Nevis,
Mulhacén, Teide, Matterhorn, Mont Blanc, Kilimanjaro, Denali, Aconcagua and
Everest.

To add a sheet:

```sh
python3 tools/cut-sheet.py art/sheets/cast-neutral.jpg web/img/cast banana shark dino astro penguin bee pizza knight avocado croissant
python3 tools/cut-sheet.py art/sheets/cast-happy.jpg web/img/cast banana shark dino astro penguin bee pizza knight avocado croissant --suffix=-happy
python3 tools/cut-sheet.py art/sheets/cast-confused.jpg web/img/cast banana shark dino astro penguin bee pizza knight avocado croissant --suffix=-sad
python3 tools/cut-sheet.py art/sheets/badges.jpg web/img/badges snowdon bennevis mulhacen teide matterhorn montblanc kilimanjaro denali aconcagua everest --size=200
python3 tools/cut-sheet.py art/sheets/mountains.jpg web/img/mountains snowdon bennevis mulhacen teide matterhorn montblanc kilimanjaro denali aconcagua everest
python3 tools/cut-sheet.py art/sheets/icons-a.jpg web/img/icons --cols=5 --rows=3 --size=160 --gap=60 mountain dumbbell trophy bag user coin bolt calendar lock check speaker turtle book star crown
python3 tools/cut-sheet.py art/sheets/icons-b.jpg web/img/icons --cols=5 --rows=3 --size=160 --gap=60 refresh target headphones cards bubble raindrop mallet memory truefalse quiz heart oddone scramble hearts swords
python3 tools/cut-sheet.py art/sheets/icons-c.jpg web/img/icons --cols=5 --rows=3 --size=160 --gap=60 potion snowflake chest gift gear share sun moon music vibrate globe users cloud sparkle flag
python3 tools/cut-sheet.py art/sheets/avatar-a.jpg web/img/look --cols=5 --rows=4 --size=240 --gap=60 top-tee-blue top-tee-coral top-tee-yellow top-tee-white top-hoodie top-stripes top-star top-football top-bolt top-gold pants-jeans pants-navy pants-khaki pants-shorts pants-joggers pants-yellow pants-check pants-track pants-green pants-goldpants
python3 tools/cut-sheet.py art/sheets/avatar-b.jpg web/img/look --cols=5 --rows=3 --size=240 --gap=60 hat-cap hat-beanie hat-bucket hat-headphones hat-crown hat-cowboy hat-party hat-chef hat-viking hat-wizard hair-short hair-long hair-curly hair-bun hair-spiky
python3 tools/list-art.py
```

## The three icon prompts (copy each one whole into Gemini)

**Icons A — menu and rewards** (save as `art/sheets/icons-a.jpg`)

> One image: a neat grid of 5 columns × 3 rows of icons, 15 icons in total, each centred in its own equal square cell with plenty of empty space around it. The background is one solid flat magenta colour #FF00FF everywhere — no gradient, no shadows on the background, no borders, no grid lines, no text, letters or numbers anywhere. Style: chunky, friendly mobile-game icons with slightly thick dark navy outlines (#1B1D2A), flat colours with one soft highlight, slightly rounded shapes, drawn front-on, each filling about 70% of its cell. Colours: mainly cobalt blue #2F5BEA, sunflower yellow / gold #FFC531 and coral #FF5A4E, plus white and a little navy. All 15 icons in exactly the same style, line weight and size, like one icon set. Not 3D, not clay, not emoji, not photo-realistic. The 15 icons, in reading order (left to right, top row first): 1) a blue mountain with a small coral flag on the peak, 2) a dumbbell, 3) a gold trophy cup, 4) a shopping bag, 5) a person's head-and-shoulders silhouette, 6) a shiny gold coin, 7) a yellow lightning bolt, 8) a calendar page with a small coral flame on it, 9) a padlock, 10) a big tick (check mark), 11) a speaker with sound waves, 12) a cute turtle, 13) an open book, 14) a gold star, 15) a gold crown.

**Icons B — practice and mini games** (save as `art/sheets/icons-b.jpg`)

> One image: a neat grid of 5 columns × 3 rows of icons, 15 icons in total, each centred in its own equal square cell with plenty of empty space around it. The background is one solid flat magenta colour #FF00FF everywhere — no gradient, no shadows on the background, no borders, no grid lines, no text, letters or numbers anywhere. Style: chunky, friendly mobile-game icons with slightly thick dark navy outlines (#1B1D2A), flat colours with one soft highlight, slightly rounded shapes, drawn front-on, each filling about 70% of its cell. Colours: mainly cobalt blue #2F5BEA, sunflower yellow / gold #FFC531 and coral #FF5A4E, plus white and a little navy. All 15 icons in exactly the same style, line weight and size, like one icon set. Not 3D, not clay, not emoji, not photo-realistic. The 15 icons, in reading order: 1) two circular arrows chasing each other (refresh), 2) a target with an arrow in the bullseye, 3) headphones, 4) a small stack of flashcards, 5) a big shiny soap bubble, 6) a blue raindrop, 7) a wooden mallet, 8) two playing cards lying face down, 9) a tick and a cross side by side, 10) a speech bubble with a question mark, 11) a coral heart, 12) three red apples and one yellow pear, 13) three jumbled square letter tiles (blank, no letters), 14) three small hearts in a row, 15) two crossed swords.

**Icons C — shop, settings and extras** (save as `art/sheets/icons-c.jpg`)

> One image: a neat grid of 5 columns × 3 rows of icons, 15 icons in total, each centred in its own equal square cell with plenty of empty space around it. The background is one solid flat magenta colour #FF00FF everywhere — no gradient, no shadows on the background, no borders, no grid lines, no text, letters or numbers anywhere. Style: chunky, friendly mobile-game icons with slightly thick dark navy outlines (#1B1D2A), flat colours with one soft highlight, slightly rounded shapes, drawn front-on, each filling about 70% of its cell. Colours: mainly cobalt blue #2F5BEA, sunflower yellow / gold #FFC531 and coral #FF5A4E, plus white and a little navy. All 15 icons in exactly the same style, line weight and size, like one icon set. Not 3D, not clay, not emoji, not photo-realistic. The 15 icons, in reading order: 1) a small potion bottle with a lightning bolt on the label, 2) an ice-blue snowflake, 3) a treasure chest overflowing with gold coins, 4) a wrapped gift box with a bow, 5) a gear cog, 6) a share arrow coming up out of a box, 7) a sun, 8) a crescent moon, 9) a musical note, 10) a phone with little vibration lines either side, 11) a globe, 12) two people side by side, 13) a fluffy white cloud, 14) a gold sparkle burst, 15) a flag on a pole.

## The two avatar prompts (copy each one whole into Gemini)

The clothes go on the character you build, so every top has to be the same
shape, every pair of trousers the same shape, and every hat sized for the same
head. Tip: attach one of your icon sheets too so the style matches.

**Avatar A — tops and trousers** (save as `art/sheets/avatar-a.jpg`)

> One image: a neat grid of 5 columns × 4 rows, 20 separate clothing items, each centred in its own equal square cell with plenty of empty space around it. The background is one solid flat magenta colour #FF00FF everywhere — no gradient, no shadows on the background, no borders, no grid lines, no text, letters or numbers anywhere. Each item is drawn on its own with NO person, NO head, NO hands, NO hanger and NO mannequin — just the clothing, front view, flat like a sticker, as if worn by an invisible child standing straight with arms down by their sides. Style: chunky, friendly mobile-game art with slightly thick dark navy outlines (#1B1D2A), flat colours with one soft highlight, slightly rounded shapes. Colours: cobalt blue #2F5BEA, sunflower yellow / gold #FFC531 and coral #FF5A4E, plus white, navy and the colours named below. Not 3D, not clay, not emoji, not photo-realistic. Rows 1 and 2 are 10 tops, ALL EXACTLY THE SAME SIZE AND SHAPE (a simple short-sleeved top with the sleeves angled down, round neck hole, same width and length), only the colour and pattern change: 1) plain cobalt blue t-shirt, 2) plain coral t-shirt, 3) plain yellow t-shirt, 4) white t-shirt with one wide blue band across the chest, 5) dark navy hoodie with a hood behind the neck and two white drawstrings, 6) white t-shirt with blue horizontal stripes, 7) blue t-shirt with a big yellow star on the chest, 8) coral football shirt with a white V collar, 9) black t-shirt with a yellow lightning bolt on the chest, 10) shiny gold t-shirt with sparkles. Rows 3 and 4 are 10 pairs of trousers, ALL EXACTLY THE SAME SIZE AND SHAPE (straight full-length legs, waistband at the top, no shoes, no legs inside), except number 14: 11) blue jeans, 12) dark navy trousers, 13) khaki trousers, 14) coral shorts (same waist, legs end above the knee), 15) grey joggers, 16) yellow trousers, 17) blue checked trousers, 18) black tracksuit bottoms with a white stripe down each side, 19) green cargo trousers with pockets, 20) shiny gold trousers with sparkles.

**Avatar B — hats and hair** (save as `art/sheets/avatar-b.jpg`)

> One image: a neat grid of 5 columns × 3 rows, 15 separate items, each centred in its own equal square cell with plenty of empty space around it. The background is one solid flat magenta colour #FF00FF everywhere — no gradient, no shadows on the background, no borders, no grid lines, no text, letters or numbers anywhere. Each item is drawn on its own with NO person, NO face and NO head — just the item, front view, as if it sits on an invisible round cartoon head, every item sized for the same head. Style: chunky, friendly mobile-game art with slightly thick dark navy outlines (#1B1D2A), flat colours with one soft highlight, slightly rounded shapes. Colours: cobalt blue #2F5BEA, sunflower yellow / gold #FFC531 and coral #FF5A4E, plus white, navy and the colours named below. Not 3D, not clay, not emoji, not photo-realistic. Rows 1 and 2 are 10 hats, each with a flat, level bottom edge where it would sit on the head: 1) cobalt blue baseball cap with the peak pointing to the right, 2) coral beanie with a white pom-pom, 3) yellow bucket hat, 4) navy headphones with coral ear cups (just the headphones, an empty gap where the head would be), 5) gold crown with a coral jewel, 6) brown cowboy hat with a navy band, 7) coral party cone hat with yellow stripes and a yellow pom-pom, 8) tall puffy white chef's hat, 9) grey viking helmet with two white horns, 10) navy wizard hat with yellow stars. Row 3 is 5 hairstyles, hair only, drawn in plain LIGHT GREY (#D0D0D0) with navy outlines so the app can recolour it, with an empty face-shaped gap in the middle where the face would be: 11) short neat hair, 12) long straight hair down to the shoulders, 13) big curly hair, 14) hair in a bun on top, 15) spiky hair.
