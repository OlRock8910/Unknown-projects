<p align="center">
  <img src="web/icons/icon-192.png" alt="Spark" width="96">
</p>

<p align="center">
  <a href="https://olrock8910.github.io/Unknown-projects/spark/"><img alt="Open in your browser" src="https://img.shields.io/badge/▶_Open-in_your_browser-ff7a3d?style=for-the-badge"></a>
  <a href="https://github.com/OlRock8910/Unknown-projects/raw/main/spark/apk/Spark.apk"><img alt="Download the Android app" src="https://img.shields.io/badge/Download-Spark.apk-3ddc84?style=for-the-badge&logo=android&logoColor=white"></a>
  <img alt="No ads, no accounts" src="https://img.shields.io/badge/no_ads-no_accounts-555?style=for-the-badge">
</p>

# Spark ✨

**Your own AI to chat with, and it gets better the more you use it.** Ask
it anything, get help with homework, plans, writing or code. Pick its
brain when you start:

- **Free brain (no key, no account):** a small open AI model that runs on
  your phone and looks things up on Wikipedia.
- **Claude:** Anthropic's AI, the smartest option, with your own API key.

| **Pick a brain** | **Free brain** | **Claude** | **It learns** | **Its memory** | **Your chats** |
|:---:|:---:|:---:|:---:|:---:|:---:|
| <img src="docs/1-welcome.jpg" width="150"> | <img src="docs/7-free.jpg" width="150"> | <img src="docs/3-chat.jpg" width="150"> | <img src="docs/6-learned.jpg" width="150"> | <img src="docs/5-memory.jpg" width="150"> | <img src="docs/4-chats.jpg" width="150"> |

## The free brain

Tap **Use the free brain** and Spark downloads a small AI model (Qwen3
0.6B, about 0.5–1 GB, so use Wi-Fi) from Hugging Face. That only happens
once: after that it runs **entirely on your phone**, even offline.

- **It looks things up.** For questions about facts, Spark searches
  Wikipedia first and answers from what it finds, with links to the
  articles (🔎 **Looked up**). Only the search words leave your phone. You
  can turn this off in **Settings**. Without internet it still answers from
  what it knows (📴).
- **You can teach it.** Say "remember that my dog is called Max", or type
  facts into **Settings › What Spark has learned**, and it uses them when
  they're relevant.
- **Be realistic:** it's much smaller than Claude, so it's slower, makes
  more mistakes and can't see photos. It needs a fairly recent phone with
  about 1.5 GB free. It uses the phone's graphics chip if the browser
  allows it, and the processor otherwise.
- **It can't do anything on your phone.** The app asks Android for one
  permission, the internet. It can't read your files, messages, contacts or
  anything else, and it never takes actions; it only reads Wikipedia.
- To free up the space, use **Settings › Delete the downloaded brain**.

- **Replies stream in as they're written**, with lists, tables and code
  blocks laid out properly (code has a copy button).
- **Photos:** tap the picture button to add up to 4 photos to a message, then
  ask about them ("what's this plant?", "help with question 3").
- **Thinking:** Claude thinks before it answers. Tap **Thought process** to
  see a summary of how it got there. In **Settings**, pick **Quick**,
  **Balanced** or **Deep** thinking.
- **About you:** tell Spark about yourself and how you like answers
  ("I'm 15, keep it short") and it remembers in every new chat.
- **Room for a lot.** Chats, photos and memory are saved in your phone's
  database, which can use gigabytes of free space, and Spark asks the phone
  never to clear it. **Settings** shows how much it's using. Open the menu
  to go back to any chat, or delete it.
- **Chats that never run out.** When a chat gets very long, Claude
  summarises the oldest part so the chat can keep going for ever (a 📚 note
  shows where).
- **Stop** a reply partway through, **copy** any answer, or tap **↻** for a
  different answer.

## How Spark upgrades itself (safely)

**It learns about you.** As you chat, Spark saves short notes about you
("Name is Sam, loves football") and how you like answers ("likes short
answers"), and reads them at the start of every new chat. Each time it
saves one, a **✨ Learned** card appears in the chat with an **Undo**
button. Ask it to forget something and it will. It can keep thousands of
notes: the newest 150 are read at the start of each chat, and it searches
the rest when they'd help (🧠 **Checked memory**). It can also search
everything you've said in your old chats (🔎 **Looked back**), so it can
pick up where you left off.

**It moves to newer Claude models.** About twice a day Spark checks
Anthropic's list of models. When a newer Claude Opus comes out, new chats
use it (**Settings › Spark's brain**). If the new model doesn't work with
Spark, it goes straight back to the one that does and never tries that
model again.

**Why it won't go off the rails:**

- **Its rules are fixed.** The instructions that make Spark *Spark* are
  written into the app. Its notes are given to it as information about
  you, labelled as something that can't change its rules, so a note can
  never rewrite how it behaves.
- **You can see everything it learns.** Every note is listed in
  **Settings › What Spark has learned**, where you can delete any of them,
  wipe the lot, or switch learning off.
- **Its memory is short notes only.** Each note is at most 300 characters
  (up to 5,000 notes), it's told not to save private things like health,
  addresses or passwords, and the app refuses notes that look like
  passwords or keys.
- **It can't change its own code or its own "brain."** Spark's values come
  from Claude, which Anthropic trains to be honest and safe. Spark can
  only choose which official Claude model to use, and only ones Anthropic
  publishes. It never edits the app itself.

## Using Claude: you need an Anthropic API key

The free brain needs no key. For Claude, Spark talks to Claude directly with your own key, so there's no Spark
account or subscription. Anthropic charges for what you use: a typical
question costs a few cents, and long chats, photos and Deep thinking cost
more. You can set a monthly spending limit in the console.

1. Go to **[console.anthropic.com](https://console.anthropic.com/settings/keys)**
   and sign up.
2. Add some credit under **Billing**. A few pounds or dollars lasts a long time.
3. Under **API keys**, tap **Create Key** and copy it.
4. Open Spark and paste the key in. Spark checks the key (for free) before
   saving it.

**Privacy:** your key and your chats are saved only on your device. Each
message, along with the chat so far, goes straight from your phone to
Anthropic to get a reply. Nothing passes through any other server. Anyone
who can use your phone can use your key, so you can delete it at
console.anthropic.com at any time and make a new one.

## Install the Android app

1. On your phone, tap the green **Download Spark.apk** button at the top of
   this page (or open [`apk/Spark.apk`](apk/Spark.apk) and tap **Download**).
2. Open the downloaded file. If Android asks, allow your browser or file
   manager to **install unknown apps**.
3. Tap **Install**, then open **Spark**.

Or use it in any browser at
**https://olrock8910.github.io/Unknown-projects/spark/**. On a phone, tap
**Add to Home screen** in your browser's menu to keep it like an app.

## How it's built

```
web/              The whole app: plain HTML, CSS and JavaScript, no build step
  js/app.js         Screens, chats, memory, upgrades, talking to Claude, and the free brain's prompts
  js/local.js       Starts the free brain, follows its download, and searches Wikipedia
  js/brain-worker.js  Runs the free brain's model in the background (Transformers.js)
  js/markdown.js    Lays out Claude's replies (escaped, so replies can't inject HTML)
  js/store.js       Saves chats and memory in IndexedDB, settings in localStorage
  js/vendor/        Anthropic's TypeScript SDK and Hugging Face's Transformers.js, bundled by vendor.mjs
android/          A WebView wrapper with a photo picker and the back button
build-apk.sh      Builds and signs the APK without Gradle
make-icon.py      Draws the icon
tests/smoke.mjs   Uses the app in a real browser against a stand-in Claude API
tests/free-brain.mjs  Checks the real brain code loads, then walks through the free brain with stand-ins
```

To run it on a computer, serve `web/` (ES modules don't load from
`file://`), for example `npx serve web`, and open the address it prints.

**Talking to Claude.** Each reply is one streaming request to the Messages
API from the browser, using Anthropic's SDK with
`dangerouslyAllowBrowser: true` (fine here, because it's your own key on
your own device). The requests:

- use Claude's newest Opus model with adaptive thinking, summarised thinking
  shown in the app, and the effort level from Settings;
- turn on server-side fallbacks (`fallbacks: "default"`): if Claude's safety
  checks decline a harmless message by mistake, Anthropic answers it with a
  backup model instead of failing, and Spark notes it under the reply;
- give Claude four tools: `save_memory`, `forget_memory`, `search_memory`
  and `search_chats` (word search on the device; only the matching
  passages are sent). Their input is checked before anything runs; a
  malformed call goes back to Claude as an error instead;
- once a chat passes 120,000 tokens, turn on server-side compaction, which
  summarises older turns when the chat nears the limit;
- cache the conversation, so long chats cost less;
- send each chat's history back exactly as it came, thinking blocks
  included. Every chat keeps the system prompt, tools and model it started
  with, so changing **About you**, the memory or the model only affects
  new chats. (Notes saved partway through a chat are already in that chat
  as tool calls.)

If Claude declines a message, Spark takes it out of the chat and puts it back
in the box to reword.

**The free brain.** `brain-worker.js` loads the model with Transformers.js
in a Web Worker: the first of `onnx-community/Qwen3-0.6B-ONNX` and
`onnx-community/Qwen2.5-0.5B-Instruct` that loads, 4-bit quantised, on
WebGPU when there is an adapter and WebAssembly otherwise. Transformers.js
caches the model files and its ONNX Runtime WebAssembly (fetched from
jsDelivr) in the browser's Cache Storage. For each message, `app.js` builds
a short prompt from the relevant notes, up to three Wikipedia article
introductions (the API needs no key and allows calls from the browser) and
the last few turns. The Android app serves its files with
cross-origin-isolation headers so WebAssembly can use every core.

### Updating the bundled libraries

```bash
npm install --no-package-lock --ignore-scripts   # skips onnxruntime-node's native download
npm run vendor      # rebuilds web/js/vendor/ from @anthropic-ai/sdk and @huggingface/transformers
npm test            # the Claude browser test
node tests/free-brain.mjs
```

### Building the APK

```bash
sudo apt-get install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 default-jdk-headless zip
./build-apk.sh             # → build/Spark.apk
cp build/Spark.apk apk/    # update the downloadable copy
```

`.github/workflows/spark.yml` runs both browser tests and builds the APK
(uploaded as the `spark-apk` artifact) whenever `spark/` changes, and
`adjetivos-pages.yml` publishes `web/` as the website alongside Adjetivos.

Every build is signed with `android/spark-sideload.jks`, which is committed
on purpose and whose password (`sparkapp`) is public, so new versions install
over old ones and keep your chats. It is only for sideloading; the Play
Store would need a private key.

## License

MIT, like the rest of this repository: see [LICENSE](../LICENSE). The bundled
Anthropic SDK is MIT licensed too: see
[`web/js/vendor/anthropic-LICENSE.txt`](web/js/vendor/anthropic-LICENSE.txt).
