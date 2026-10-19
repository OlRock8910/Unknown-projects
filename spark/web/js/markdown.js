// A small Markdown renderer for Claude's replies: headings, paragraphs,
// lists, quotes, code blocks, tables, links, bold, italic and inline code.
// Everything is escaped first, so a reply can never inject HTML. An unclosed
// code block (mid-stream) renders as code up to the end.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code block.
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      const lang = fence[2] || 'code';
      out.push(`<div class="code"><div class="code-head"><span>${esc(lang)}</span><button data-a="copy-code">Copy</button></div><pre><code>${esc(body.join('\n'))}</code></pre></div>`);
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const n = Math.min(h[1].length + 1, 4);
      out.push(`<h${n}>${inline(h[2].replace(/\s*#+\s*$/, ''))}</h${n}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(q.join('\n'))}</blockquote>`);
      continue;
    }

    // Table: a header row, then a |---|---| row.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        '<div class="table"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>',
      );
      continue;
    }

    if (LIST.test(line)) {
      out.push(list(lines, i, (end) => (i = end)));
      continue;
    }

    // Paragraph: runs until a blank line or the start of another block.
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

// A list, with deeper-indented items nested inside the item above them.
function list(lines, start, done) {
  const first = lines[start].match(LIST);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(LIST);
    if (m && m[1].length === indent) {
      items.push({ text: [m[3]], sub: '' });
      i++;
    } else if (m && m[1].length > indent && items.length) {
      items[items.length - 1].sub += list(lines, i, (end) => (i = end));
    } else if (!m && lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
      items[items.length - 1].text.push(lines[i].trim());
      i++;
    } else if (!lines[i].trim() && i + 1 < lines.length && (lines[i + 1].match(LIST)?.[1].length ?? -1) >= indent) {
      i++; // a blank line between items
    } else {
      break;
    }
  }
  done(i);
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && parseInt(first[2], 10) !== 1 ? ` start="${parseInt(first[2], 10)}"` : '';
  return `<${tag}${startAttr}>${items.map((it) => `<li>${it.text.map(inline).join('<br>')}${it.sub}</li>`).join('')}</${tag}>`;
}
