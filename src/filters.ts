/**
 * Apps whose videos or audio can be left out in Settings, matched by the
 * folder they save into ("…/WhatsApp/Media/WhatsApp Audio", "Snapchat"...).
 */
export const APP_FILTERS: { key: string; label: string; match: RegExp }[] = [
  { key: 'whatsapp', label: 'WhatsApp', match: /whatsapp/i },
  { key: 'snapchat', label: 'Snapchat', match: /snapchat/i },
  { key: 'telegram', label: 'Telegram', match: /telegram/i },
  { key: 'instagram', label: 'Instagram', match: /instagram/i },
  { key: 'tiktok', label: 'TikTok', match: /tiktok|musically/i },
  { key: 'facebook', label: 'Facebook & Messenger', match: /facebook|messenger/i },
  { key: 'screen', label: 'Screen recordings', match: /screen ?(record|cap)/i },
  { key: 'recordings', label: 'Voice & call recordings', match: /recordings?$|recordings?\/|recorder|call ?rec|voice ?notes?|sound ?rec/i },
];

/** Is something in `path` switched off by the given app keys or folder paths? */
export function isFiltered(path: string, folder: string, apps: string[], folders: string[]) {
  const where = `${path}/${folder}`;
  if (apps.some((k) => APP_FILTERS.find((a) => a.key === k)?.match.test(where))) return true;
  // Only that exact folder: folders inside it have their own switches in the
  // list, so switching off "mp3" must not hide "mp3/spider man music".
  const p = path.toLowerCase();
  return folders.some((f) => p === f.toLowerCase());
}
