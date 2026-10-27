const dictionary = require('../data/product-gu.json');
const FIELDS = ['name', 'description', 'category', 'unit'];
const cache = new Map();
const pending = new Map();
const MESSAGE = 'Gujarati translation could not be generated. Enter the Gujarati fields manually or try again.';
const normalize = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
function translationError() { return Object.assign(new Error(MESSAGE), { status: 503 }); }

function splitText(text, limit = 450) {
  const chunks = [];
  let chunk = '';
  for (const word of text.split(/(\s+)/u)) {
    if (Buffer.byteLength(chunk + word, 'utf8') <= limit) { chunk += word; continue; }
    if (chunk.trim()) chunks.push(chunk.trim());
    chunk = '';
    for (const character of word) {
      if (Buffer.byteLength(chunk + character, 'utf8') > limit) { chunks.push(chunk); chunk = ''; }
      chunk += character;
    }
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
}
function decode(text) {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
    const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return value <= 0x10ffff ? String.fromCodePoint(value) : match;
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, entity) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[entity]);
}
async function remoteTranslation(text, fetcher) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', 'en|gu');
  if (process.env.MYMEMORY_EMAIL) url.searchParams.set('de', process.env.MYMEMORY_EMAIL);
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw translationError();
  const result = await response.json();
  const translated = result.responseData?.translatedText;
  if (Number(result.responseStatus) !== 200 || result.quotaFinished || typeof translated !== 'string' || !/[\u0a80-\u0aff]/u.test(translated)) throw translationError();
  return decode(translated).trim();
}
async function translateText(value, { fetcher = global.fetch } = {}) {
  const text = normalize(value);
  if (!text) return '';
  if (dictionary[text]) return dictionary[text];
  if (!/[a-z]/i.test(text)) return text;
  if (cache.has(text)) return cache.get(text);
  if (pending.has(text)) return pending.get(text);
  const task = (async () => {
    try {
      const lines = [];
      for (const line of text.split('\n')) {
        const parts = [];
        for (const part of splitText(line)) parts.push(dictionary[part] || await remoteTranslation(part, fetcher));
        lines.push(parts.join(' '));
      }
      const translated = lines.join('\n');
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      cache.set(text, translated);
      return translated;
    } catch { throw translationError(); }
    finally { pending.delete(text); }
  })();
  pending.set(text, task);
  return task;
}
async function gujaratiFields(body, current = {}, { translate = translateText } = {}) {
  const result = {};
  for (const field of FIELDS) {
    const target = field + 'Gu';
    if (body[field] === undefined && body[target] === undefined && current[field] !== undefined) continue;
    const source = body[field] ?? current[field] ?? '';
    const manual = body[target];
    if (typeof source !== 'string' || manual !== undefined && typeof manual !== 'string' || source.length > 16000 || manual?.length > 16000) {
      throw Object.assign(new Error('Product text must be a string of at most 16000 characters.'), { status: 400 });
    }
    if (!normalize(source)) { result[target] = ''; continue; }
    if (normalize(manual)) { result[target] = normalize(manual); continue; }
    if (manual === undefined && source === current[field] && current[target]) { result[target] = current[target]; continue; }
    result[target] = await translate(source);
  }
  return result;
}
module.exports = { gujaratiFields, translateText, splitText };
