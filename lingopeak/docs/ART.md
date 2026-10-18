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
| 6–9. Icon sheets: rewards, menu and shop, mini games, extras (see the chat for the four prompts) | `art/sheets/icons-*.jpg` | still to make |

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
python3 tools/cut-sheet.py art/sheets/icons-rewards.jpg web/img/icons coin gem flame bolt trophy lock star heart speaker crown --size=160
python3 tools/cut-sheet.py art/sheets/icons-menu.jpg web/img/icons mountain dumbbell trophy-podium bag user snowflake potion pouch chest calendar --size=160
python3 tools/list-art.py
```
