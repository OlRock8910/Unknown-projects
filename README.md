# Adjetivos 🇪🇸

An Android app for learning Spanish **describing words**: *molesto*
(annoying), *simpática* (nice), *perezoso* (lazy) and 93 more, through 19
mini games.

## Install it on your phone

1. On the phone, open [`apk/Adjetivos.apk`](apk/Adjetivos.apk) on GitHub and
   tap **Download** (or "View raw").
2. Open the downloaded file. If Android asks, allow your browser or file
   manager to **install unknown apps**.
3. Tap **Install**, then open **Adjetivos**.

It works fully offline. Spanish pronunciation uses the phone's own
text-to-speech engine. If words aren't spoken, go to **Settings › Text-to-speech**
and install a Spanish voice (Google's engine has one).

## What's inside

**96 adjectives** in four packs: 😤 Annoying & mean, 😇 Good traits,
👀 Looks, 💭 Feelings. Each one has its feminine form, an emoji, an opposite
where there is one, ser/estar, and tips for false friends (*sensible* means
*sensitive*, *embarazada* means *pregnant*).

**19 mini games**

| | Game | How it plays |
| --- | --- | --- |
| 🫧 | Bubble Pop | Bubbles float up — pop the Spanish word for the English one |
| 🎈 | Gender Pop | "She is lazy" — pop *perezosa*, not *perezoso* |
| ☔ | Word Rain | Meanings fall; catch the right one before it lands. 3 lives |
| 🥷 | Word Ninja | Words fly up — swipe to slice the right one, avoid the rest |
| 🔨 | Whack-a-Word | Bonk the mole holding the right word |
| 🃏 | Memory Match | Flip cards to pair Spanish with English |
| ⚡ | True or False | 60-second blitz; swipe or tap |
| ❓ | Quick Quiz | 10 mixed questions: words, sentences, fill the gap |
| 🔥 | Survival | Endless questions with less time each round, 3 lives |
| 🔗 | Match Up | Connect five pairs as fast as you can, three rounds |
| ☯️ | Opposites | *alto* ↔ *bajo*, *valiente* ↔ *cobarde* |
| 😜 | Emoji Guess | Which adjective is the emoji? |
| 🎧 | Listen Up | Hear a sentence, pick what the person is like |
| 🕵️ | Describe Them | "Never stops talking" → *Lucía es habladora* |
| 🔤 | Word Scramble | Unscramble the letters, in the right gender |
| 🎈 | Save the Balloons | Hangman — each wrong letter pops a balloon |
| 🧱 | Sentence Builder | Build "Mi hermana es muy generosa" from blocks |
| 👫 | ¿Él o Ella? | Is the form for him, her, or both? |
| ⚖️ | ¿Ser o Estar? | *es* or *está*, including words that change meaning |

Also: flashcards, eight short grammar lessons, a searchable word list with
pronunciation, XP and levels, a daily goal and streak, combo multipliers,
stars and best scores. Words you get wrong come up more often.

## How it's built

```
web/            The whole app: plain HTML, CSS and JavaScript, no build step
  js/data.js      Every adjective, the packs, sentence parts, grammar tips
  js/core.js      Saving, sound effects, speech, the game session and scoring
  js/games.js     The 19 mini games
  js/app.js       Screens and navigation
android/        A WebView wrapper that adds Spanish text-to-speech and vibration
build-apk.sh    Builds and signs the APK without Gradle
tests/smoke.mjs Plays every game in a real browser and fails on any error
```

Open `web/index.html` in a desktop browser to play without building anything.

### Building the APK

```bash
sudo apt-get install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 default-jdk-headless zip
./build-apk.sh                 # → build/Adjetivos.apk
cp build/Adjetivos.apk apk/    # update the downloadable copy
```

CI (`.github/workflows/spanish-adjectives.yml`) runs the smoke test and
builds the APK whenever anything under `spanish-adjectives/` changes. The
APK is uploaded as the `adjetivos-apk` artifact.

### Signing

Every build is signed with `android/adjetivos-sideload.jks`, which is
committed on purpose and whose password (`adjetivos`) is public. Every build
then has the same signature, so new versions install over old ones and keep
your progress. It is only for sideloading — publishing to the Play Store
would need a private key.
