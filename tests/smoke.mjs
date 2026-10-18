/**
 * Drives the browser build end to end: add videos, pick some for My List,
 * play, resume after a reload, and roll on to the next video.
 *
 *   npm run build && node tests/smoke.mjs [--shots]
 *
 * --shots writes screenshots to test-results/.
 */
import { chromium } from 'playwright';
import { preview } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// "Beach day (1).webm" is a straight copy: it should be hidden as a duplicate.
const fixtures = ['Beach day.webm', 'Birthday party.webm', 'Phone clip.webm', 'Beach day (1).webm'].map((f) => path.join(here, 'fixtures', f));
/** Songs/Chill/… and Songs/Gym/…: each folder should become a playlist. */
const songsFolder = path.join(here, 'fixtures', 'Songs');

/** Pretend the app went to the background (or came back), as a locked screen does. */
async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
const shots = process.argv.includes('--shots');
const outDir = path.join(root, 'test-results');

let step = 0;
function check(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`  ok ${++step} ${msg}`);
}

async function shot(page, name) {
  if (!shots) return;
  mkdirSync(outDir, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function main() {
  const server = await preview({ root, preview: { port: 4174, strictPort: true }, logLevel: 'warn' });
  const url = 'http://localhost:4174/';
  const preinstalled = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  try {
    await page.goto(url);
    await page.getByText('Add your videos').waitFor();
    check(true, 'first run asks for videos');
    await shot(page, '01-empty');

    await page.setInputFiles('#file-input', fixtures);
    await page.locator('.toast', { hasText: 'Added 3 videos to My List (1 duplicate skipped)' }).waitFor({ timeout: 30000 });
    check(true, 'three videos imported and added to My List, the copy skipped');

    await page.locator('.hero h1').waitFor();
    const rowTitles = await page.locator('.row h2').allTextContents();
    check(rowTitles.includes('My List') && rowTitles.includes('Recently Added'), `home rows: ${rowTitles.join(', ')}`);
    const beach = page.locator('.row-scroll[data-row="recent"] .card', { hasText: 'Beach day' });
    check((await beach.locator('.dur').textContent()) === '0:14', 'duration read from the file');
    check((await beach.locator('img').getAttribute('src'))?.startsWith('blob:'), 'thumbnail generated');
    check((await page.locator('.tab[data-tab="list"] .count').textContent()) === '3', 'My List badge shows 3');
    await shot(page, '02-home');

    // Remove one from My List with Edit.
    await page.locator('.tab[data-tab="list"]').click();
    await page.locator('#list-grid .card').first().waitFor();
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.locator('#list-grid .card', { hasText: 'Phone clip' }).click();
    await shot(page, '03-list-edit');
    await page.locator('.selbar [data-a="remove-selected"]').click();
    check((await page.locator('#list-grid .card').count()) === 2, 'removed one from My List');

    // Pick it again from the Library with Select.
    await page.locator('.tab[data-tab="library"]').click();
    await page.locator('#lib-grid .card').first().waitFor();
    check((await page.locator('#lib-grid .card').count()) === 3, 'library lists all three');
    check((await page.locator('.dupe-note').textContent()).startsWith('1 duplicate hidden'), 'the copy is hidden and counted');
    await page.locator('[data-a="toggle-dupes"]').click();
    check((await page.locator('#lib-grid .card').count()) === 4, 'Show reveals the copy');
    await page.locator('[data-a="toggle-dupes"]').click();
    check((await page.locator('#lib-grid .card').count()) === 3, 'Hide hides it again');
    await page.locator('[data-a="select"]').click();
    await page.locator('.selbar .sel-all').click();
    check((await page.locator('.selbar .sel-count strong').textContent()) === '3', 'Select all picks every video');
    await page.locator('.selbar .sel-all').click();
    check((await page.locator('.selbar .sel-count strong').textContent()) === '0', 'and None clears it');
    await page.locator('#lib-grid .card', { hasText: 'Phone clip' }).click();
    await page.locator('#lib-grid .card', { hasText: 'Beach day' }).click();
    await shot(page, '04-library-select');
    await page.locator('.selbar [data-a="add-selected"]').click();
    await page.locator('.toast', { hasText: 'Added 1 video to My List (1 already there)' }).waitFor();
    check(true, 'selected videos added, duplicates skipped');
    check((await page.locator('.tab[data-tab="list"] .count').textContent()) === '3', 'badge back to 3');

    // Search narrows the grid.
    await page.locator('input[data-f="query"]').fill('birth');
    check((await page.locator('#lib-grid .card').count()) === 1, 'search filters the library');
    await page.locator('input[data-f="query"]').fill('');

    // Info sheet, then play.
    await page.locator('#lib-grid .card', { hasText: 'Beach day' }).click();
    await page.locator('.sheet h2', { hasText: 'Beach day' }).waitFor();
    await shot(page, '05-info');
    await page.locator('.sheet-body [data-a="play"]').click();
    await page.locator('.player:not([hidden])').waitFor();
    await page.waitForFunction(() => document.querySelector('.player video').currentTime > 1, null, { timeout: 15000 });
    check(true, 'video plays');
    check((await page.locator('.p-save').textContent()) === 'In My List', 'player shows it is in My List');
    await page.locator('.p-save').click();
    check((await page.locator('.p-save').textContent()) === 'My List', 'removed from My List while watching');
    await page.locator('.p-save').click();
    check((await page.locator('.p-save').textContent()) === 'In My List', 'saved to My List while watching');
    await shot(page, '06-player');
    await page.evaluate(() => (document.querySelector('.player video').currentTime = 7));
    await page.waitForTimeout(600);

    // Back closes the player and lands on the library again.
    await page.goBack();
    await page.locator('.player[hidden]').waitFor({ state: 'attached' });
    check(page.url().endsWith('#/library'), `back returns to the library (${page.url()})`);

    // Everything survives a reload.
    await page.reload();
    await page.locator('.tab[data-tab="home"]').click();
    await page.locator('.row h2', { hasText: 'Continue Watching' }).waitFor();
    check(true, 'Continue Watching after reload');
    check((await page.locator('.hero [data-a="play"]').textContent()).includes('Resume'), 'hero offers Resume');
    await shot(page, '07-continue');
    await page.locator('.hero [data-a="play"]').click();
    await page.waitForFunction(() => document.querySelector('.player video').currentTime >= 6.5, null, { timeout: 15000 });
    check(true, 'resumed where it left off');
    await page.goBack();

    // Play all rolls on to the next video.
    await page.locator('.tab[data-tab="list"]').click();
    await page.locator('[data-a="play-all"]').click();
    await page.locator('.player:not([hidden])').waitFor();
    const first = await page.locator('.p-title strong').textContent();
    await page.waitForFunction(() => document.querySelector('.player video').duration > 0);
    await page.evaluate(() => {
      const v = document.querySelector('.player video');
      v.currentTime = v.duration - 0.3;
    });
    await page.locator('.p-upnext:not([hidden])').waitFor({ timeout: 10000 });
    await shot(page, '08-upnext');
    await page.locator('.p-upnext [data-p="next"]').click();
    await page.waitForFunction((t) => document.querySelector('.p-title strong').textContent !== t, first);
    check(true, `moved on from "${first}" to "${await page.locator('.p-title strong').textContent()}"`);

    // Sound keeps going in the background: the video hands over to audio, and back.
    await page.waitForFunction(() => document.querySelector('.player video').currentTime > 0.5, null, { timeout: 15000 });
    const playingTitle = await page.locator('.p-title strong').textContent();
    await setHidden(page, true);
    await page.waitForTimeout(1500);
    const bgState = await page.evaluate(() => ({
      videoPaused: document.querySelector('.player video').paused,
      session: navigator.mediaSession?.playbackState,
      title: navigator.mediaSession?.metadata?.title,
    }));
    check(
      bgState.videoPaused && bgState.session === 'playing' && bgState.title === playingTitle,
      `audio carries on in the background (${JSON.stringify(bgState)})`,
    );
    const hiddenAt = await page.evaluate(() => document.querySelector('.player video').currentTime);
    await setHidden(page, false);
    await page.waitForFunction(
      (t) => !document.querySelector('.player video').paused && document.querySelector('.player video').currentTime > t + 1,
      hiddenAt,
      { timeout: 10000 },
    );
    check(true, 'video picks up from where the background audio got to');
    await page.goBack();

    // Clear all, then Undo.
    await page.locator('.tab[data-tab="list"]').click();
    await page.locator('[data-a="clear-list"]').click();
    await page.getByText('Your list is empty').waitFor();
    check(true, 'Clear all empties My List in one tap');
    await shot(page, '09-cleared');
    await page.locator('.toast button', { hasText: 'Undo' }).click();
    await page.locator('#list-grid .card').first().waitFor();
    check((await page.locator('#list-grid .card').count()) === 3, 'Undo brings all three back');

    // Music: add a whole folder; each folder inside becomes a playlist.
    await page.locator('.tab[data-tab="music"]').click();
    await page.getByText('Add your music').waitFor();
    await page.setInputFiles('#music-folder-input', songsFolder);
    await page.locator('.toast', { hasText: 'Added 3 songs in 2 folder playlists' }).waitFor({ timeout: 20000 });
    check(true, 'folder imported, the text file skipped');
    const folderLists = await page.locator('.pl-head + .pl-list .pl-text strong').allTextContents();
    check(folderLists.join() === 'Chill,Gym', `folder playlists: ${folderLists.join(', ')}`);
    check((await page.locator('.pl', { hasText: 'Chill' }).locator('small').textContent()).startsWith('In Songs'), 'folder playlist says where it lives');
    await shot(page, '10-playlists');

    await page.locator('[data-a="music-view"][data-view="songs"]').click();
    check((await page.locator('.dupe-note').textContent()).startsWith('1 duplicate hidden'), '"Night Drive (1)" hidden as a duplicate');
    const sunrise = page.locator('.song', { hasText: 'Sunrise' });
    check((await sunrise.locator('small').textContent()) === 'The Testers', 'artist and title from "01 The Testers - Sunrise.mp3"');
    check((await sunrise.locator('.song-dur').textContent()) === '0:09', 'song length read from the file');
    await page.selectOption('select[data-f="msort"]', 'title');
    check((await page.locator('.song-text strong').allTextContents()).join() === 'Night Drive,Sunrise', 'sort by title');
    await page.locator('.song', { hasText: 'Night Drive' }).locator('.song-text').click();
    await page.locator('.mini:not([hidden])').waitFor();
    await page.waitForFunction(() => document.body.classList.contains('music-playing'), null, { timeout: 10000 });
    check((await page.locator('.mini-text strong').textContent()) === 'Night Drive', 'mini player shows the song');
    await shot(page, '11-songs');

    await page.locator('.mini-text').click();
    await page.locator('.np.open').waitFor();
    check(page.url().includes('np=1'), 'mini player opens Now Playing');
    await page.locator('.np [data-m="next"]').click();
    await page.waitForFunction(() => document.querySelector('.np-title h2')?.textContent === 'Sunrise');
    check(true, 'next song');
    await page.locator('.np [data-m="like"]').click();
    await page.locator('.np-like.on').waitFor();
    check(true, 'liked from Now Playing');
    await shot(page, '12-now-playing');
    await page.goBack();
    await page.locator('.np').waitFor({ state: 'hidden' });
    check((await sunrise.locator('[data-a="like"]').getAttribute('class')).includes('on'), 'heart shows on the song list');

    // Music keeps playing when hidden (audio-only is never paused).
    await setHidden(page, true);
    await page.waitForTimeout(800);
    check(await page.evaluate(() => document.body.classList.contains('music-playing')), 'music keeps playing in the background');
    await setHidden(page, false);

    // Make a playlist and fill it from a multi-select.
    await page.locator('[data-a="music-view"][data-view="playlists"]').click();
    await page.locator('[data-a="new-playlist"]').click();
    await page.locator('.modal input').fill('Road Trip');
    await page.locator('.modal button[type="submit"]').click();
    await page.locator('.pl-hero h1', { hasText: 'Road Trip' }).waitFor();
    check(true, 'new playlist created and opened');
    await page.goBack();
    await page.locator('[data-a="music-view"][data-view="songs"]').click();
    await page.locator('[data-a="select"]').click();
    await page.locator('.song', { hasText: 'Sunrise' }).click();
    await page.locator('.song', { hasText: 'Night Drive' }).click();
    await page.locator('.selbar [data-a="add-to-selected"]').click();
    await shot(page, '13-add-to');
    await page.locator('.pick', { hasText: 'Road Trip' }).click();
    await page.locator('.toast', { hasText: 'Added 2 songs to Road Trip' }).waitFor();
    check(true, 'two songs added to Road Trip');

    await page.locator('[data-a="music-view"][data-view="playlists"]').click();
    await page.locator('.pl', { hasText: 'Road Trip' }).click();
    await page.locator('.pl-hero h1', { hasText: 'Road Trip' }).waitFor();
    check((await page.locator('.pl-page .song').count()) === 2, 'Road Trip has both songs');
    await shot(page, '14-playlist');
    await page.locator('[data-a="rename-pl"]').click();
    await page.locator('.modal input').fill('Summer');
    await page.locator('.modal button[type="submit"]').click();
    await page.locator('.pl-hero h1', { hasText: 'Summer' }).waitFor();
    check(true, 'playlist renamed');
    await page.locator('[data-a="clear-pl"]').click();
    check((await page.locator('.pl-page .song').count()) === 0, 'Clear all empties the playlist');
    await page.locator('.toast button', { hasText: 'Undo' }).click();
    await page.locator('.pl-page .song').first().waitFor();
    check((await page.locator('.pl-page .song').count()) === 2, 'Undo puts the songs back');
    await page.locator('[data-a="delete-pl"]').click();
    await page.locator('.pl', { hasText: 'Liked Songs' }).waitFor();
    check((await page.locator('.pl', { hasText: 'Summer' }).count()) === 0, 'playlist deleted');
    await page.locator('.toast button', { hasText: 'Undo' }).click();
    await page.locator('.pl', { hasText: 'Summer' }).waitFor();
    check(true, 'Undo brings the deleted playlist back');

    // Liked Songs and a folder playlist.
    await page.locator('.pl', { hasText: 'Liked Songs' }).click();
    await page.locator('.pl-hero h1', { hasText: 'Liked Songs' }).waitFor();
    check((await page.locator('.pl-page .song-text strong').allTextContents()).join() === 'Sunrise', 'Liked Songs holds the liked song');
    await page.goBack();
    // Rename a folder playlist; the folder itself keeps its name.
    await page.locator('.pl', { hasText: 'Chill' }).click();
    await page.locator('.pl-hero h1', { hasText: 'Chill' }).waitFor();
    await page.locator('[data-a="rename-pl"]').click();
    await page.locator('.modal input').fill('Sunday Morning');
    await page.locator('.modal button[type="submit"]').click();
    await page.locator('.pl-hero h1', { hasText: 'Sunday Morning' }).waitFor();
    check(true, 'folder playlist renamed');
    await page.goBack();
    check(
      (await page.locator('.pl', { hasText: 'Sunday Morning' }).locator('small').textContent()).startsWith('Folder “Chill”'),
      'the list still says which folder it is',
    );
    await page.locator('.pl', { hasText: 'Sunday Morning' }).click();
    await page.locator('[data-a="folder-name"]').click();
    await page.locator('.pl-hero h1', { hasText: 'Chill' }).waitFor();
    check(true, 'and can go back to the folder name');
    await page.goBack();

    await page.locator('.pl', { hasText: 'Gym' }).click();
    await page.locator('.pl-hero h1', { hasText: 'Gym' }).waitFor();
    check((await page.locator('.pl-page .song').count()) === 1, 'folder playlist lists its folder');
    await page.locator('[data-a="play-songs"]').first().click();
    await page.waitForFunction(() => document.querySelector('.mini-text strong')?.textContent === 'Night Drive');
    check(true, 'Play on a folder playlist');
    // Gym has one song. At its end the music should carry on, not stop.
    await page.locator('.mini-text').click();
    await page.locator('.np.open').waitFor();
    await page.waitForFunction(() => document.body.classList.contains('music-playing'), null, { timeout: 10000 });
    const track = page.locator('.np-track');
    const box = await track.boundingBox();
    await track.click({ position: { x: box.width * 0.97, y: box.height / 2 } });
    await page.waitForFunction(() => document.querySelector('.np-title h2')?.textContent === 'Sunrise', null, { timeout: 15000 });
    await page.waitForFunction(() => document.body.classList.contains('music-playing'));
    check(true, 'after the last song in the list, another song plays');
    await page.goBack();
    await page.locator('.np').waitFor({ state: 'hidden' });
    await page.goBack();

    // Download from a link: a web page is refused, an audio file lands in a new folder playlist.
    const mp3 = await import('node:fs').then((fs) => fs.readFileSync(path.join(songsFolder, 'Gym', 'Night Drive.mp3')));
    await page.route('https://music.example/**', (r) =>
      r.fulfill({ body: mp3, headers: { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*' } }),
    );
    await page.route('https://page.example/**', (r) =>
      r.fulfill({ body: '<html>a video page</html>', headers: { 'content-type': 'text/html', 'access-control-allow-origin': '*' } }),
    );
    await page.locator('.page-head [data-a="download"]').click();
    await page.locator('.modal input[name="url"]').fill('https://page.example/watch?v=1');
    await page.locator('.modal button[type="submit"]').click();
    await page.locator('.toast', { hasText: 'not a song file' }).waitFor();
    check(true, 'a web page link is refused with a clear message');
    await page.locator('.page-head [data-a="download"]').click();
    await page.locator('.modal input[name="url"]').fill('https://music.example/files/Road%20Song.mp3');
    await page.selectOption('.modal select[name="folder"]', '__new');
    await page.locator('.modal input[name="newfolder"]').fill('Road');
    await shot(page, '15-download');
    await page.locator('.modal button[type="submit"]').click();
    await page.locator('.toast', { hasText: 'Saved “Road Song” to Road' }).waitFor({ timeout: 20000 });
    check(true, 'song downloaded from a link');
    await page.locator('.toast button', { hasText: 'View' }).click();
    await page.locator('.pl-hero h1', { hasText: 'Road' }).waitFor();
    check((await page.locator('.pl-page .song-text strong').allTextContents()).join() === 'Road Song', 'it is in the new Road folder playlist');
    await page.goBack();

    // Starting a video pauses the music.
    await page.locator('.tab[data-tab="home"]').click();
    await page.locator('.hero [data-a="play"]').click();
    await page.locator('.player:not([hidden])').waitFor();
    await page.waitForFunction(() => !document.body.classList.contains('music-playing'), null, { timeout: 5000 });
    check(true, 'playing a video pauses the music');
    await page.goBack();

    // Everything survives a reload.
    await page.reload();
    await page.locator('.mini:not([hidden])').waitFor();
    check((await page.locator('.mini-text strong').textContent()) === 'Sunrise', 'mini player restored after reload');
    await page.locator('.tab[data-tab="music"]').click();
    await page.locator('[data-a="music-view"][data-view="playlists"]').click();
    check((await page.locator('.pl', { hasText: 'Summer' }).count()) === 1, 'playlists kept after reload');

    // Hide a video, then bring it back from Settings.
    await page.locator('.tab[data-tab="library"]').click();
    await page.locator('#lib-grid .card', { hasText: 'Birthday party' }).click();
    await page.locator('.sheet [data-a="hide-video"]').click();
    await page.locator('.toast', { hasText: 'Hidden' }).waitFor();
    await page.locator('#lib-grid .card').first().waitFor();
    check((await page.locator('#lib-grid .card', { hasText: 'Birthday party' }).count()) === 0, 'Hide takes a video out of the library');
    await page.locator('.gear').click();
    await page.locator('.settings h1').waitFor();
    check((await page.locator('.set-version').textContent()) === 'ReelBox 1.6.5', 'Settings shows the version');
    await shot(page, '16-settings');
    await page.locator('.set-row', { hasText: 'Birthday party' }).locator('[data-a="unhide"]').click();
    await page.locator('.toast', { hasText: 'Back in your lists' }).waitFor();
    await page.locator('.tab[data-tab="library"]').click();
    await page.locator('#lib-grid .card', { hasText: 'Birthday party' }).waitFor();
    check(true, 'Unhide in Settings brings it back');

    // Switch a music folder off in Settings.
    await page.locator('.gear').click();
    await page.locator('summary', { hasText: 'Music folders' }).click();
    await page.locator('.set-row', { hasText: 'Gym' }).locator('.switch').click();
    check(await page.locator('details[data-key="music-folders"]').evaluate((d) => d.open), 'the folder list stays open after a switch');
    await page.locator('.tab[data-tab="music"]').click();
    await page.locator('[data-a="music-view"][data-view="songs"]').click();
    await page.locator('.song', { hasText: 'Sunrise' }).waitFor();
    check(
      (await page.locator('.song-text strong').allTextContents()).join() === 'Road Song,Sunrise',
      'switching the Gym folder off hides its songs',
    );
    await page.locator('.gear').click();
    await page.locator('summary', { hasText: 'Music folders' }).click();
    await page.locator('.set-row', { hasText: 'Gym' }).locator('.switch').click();
    await page.locator('.tab[data-tab="music"]').click();
    await page.locator('.song', { hasText: 'Night Drive' }).waitFor({ timeout: 5000 }).catch(() => {});
    check((await page.locator('.song', { hasText: 'Night Drive' }).count()) === 1, 'and switching it on brings them back');

    // Everything switched off: the Music tab says so and one button fixes it.
    await page.locator('.gear').click();
    await page.locator('summary', { hasText: 'Music folders' }).click();
    await page.locator('[data-a="folders-all"][data-kind="music"][data-on="0"]').click();
    await page.locator('.tab[data-tab="music"]').click();
    await page.getByText('Your settings are hiding everything').waitFor();
    await page.locator('[data-a="show-everything"]').click();
    await page.locator('.pl', { hasText: 'Liked Songs' }).or(page.locator('.song').first()).first().waitFor();
    check(true, 'Show everything brings songs back when settings hid them all');

    // All off, then All on.
    await page.locator('.gear').click();
    await page.locator('summary', { hasText: 'Music folders' }).click();
    await page.locator('[data-a="folders-all"][data-kind="music"][data-on="0"]').click();
    check(await page.locator('details[data-key="music-folders"]').evaluate((d) => d.open), 'still open after All off');
    check((await page.locator('details[data-key="music-folders"] input:checked').count()) === 0, 'All off switches every music folder off');
    await page.locator('[data-a="folders-all"][data-kind="music"][data-on="1"]').click();
    check(
      (await page.locator('details[data-key="music-folders"] input:not(:checked)').count()) === 0,
      'All on switches them all back on',
    );
    await page.locator('.tab[data-tab="music"]').click();
    await page.locator('.song', { hasText: 'Sunrise' }).waitFor();

    // Hide songs with Select, then Undo.
    await page.locator('[data-a="select"]').click();
    await page.locator('.song', { hasText: 'Sunrise' }).click();
    await page.locator('.selbar [data-a="hide-selected"]').click();
    check((await page.locator('.song', { hasText: 'Sunrise' }).count()) === 0, 'Select → Hide hides a song');
    await page.locator('.toast button', { hasText: 'Undo' }).click();
    await page.locator('.song', { hasText: 'Sunrise' }).waitFor();
    check(true, 'Undo un-hides it');

    // Reset: everything goes back to a first run.
    await page.locator('.gear').click();
    await page.locator('[data-a="reset"]').click();
    await page.locator('.modal button[type="submit"]').click();
    await page.getByText('Add your videos').waitFor({ timeout: 15000 });
    check(await page.locator('.mini').isHidden(), 'Reset starts ReelBox fresh');

    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    console.log('smoke test passed');
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
