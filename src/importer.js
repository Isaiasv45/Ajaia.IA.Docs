// Turns an uploaded file into HTML the editor can load.
const path = require('node:path');
const mammoth = require('mammoth');
const { marked } = require('marked');

const SUPPORTED = ['.txt', '.md', '.markdown', '.docx'];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Strip anything script-like. The editor (Quill) also whitelists formats on load,
// so this is defence in depth, not the only line.
function stripDangerous(html) {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

async function fileToHtml(originalName, buffer) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!SUPPORTED.includes(ext)) {
    const err = new Error(`Unsupported file type "${ext || 'none'}". Supported: .txt, .md, .docx`);
    err.status = 415;
    throw err;
  }
  let html;
  if (ext === '.txt') html = textToHtml(buffer.toString('utf8'));
  else if (ext === '.md' || ext === '.markdown') html = marked.parse(buffer.toString('utf8'));
  else html = (await mammoth.convertToHtml({ buffer })).value;
  return stripDangerous(html);
}

function titleFromFilename(name) {
  const base = path.basename(name || 'Imported document', path.extname(name || ''));
  return base.slice(0, 120) || 'Imported document';
}

module.exports = { fileToHtml, titleFromFilename, SUPPORTED, MAX_BYTES, stripDangerous };
