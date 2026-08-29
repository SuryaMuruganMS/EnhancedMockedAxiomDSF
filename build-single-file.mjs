/**
 * Fold the production build into one self-contained HTML file.
 *
 * `ng build` emits index.html plus separate JS/CSS and an assets folder. That
 * is right for a web server and useless for a host that serves exactly one
 * file — a chat artifact, an email attachment, a USB stick, a file:// URL.
 *
 * This inlines every script and stylesheet, rewrites the remaining asset
 * references to data URIs, and writes a single document that opens anywhere
 * with no server at all. The only thing left over the network is Google Fonts,
 * which is the one external origin an artifact is allowed to reach.
 *
 *   node build-single-file.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const DIST = 'dist/axiom-demo';
const OUT = 'axiom-demo.html';

const MIME = {
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

if (!existsSync(DIST)) {
  console.error(`No build at ${DIST}. Run: ng build --configuration production`);
  process.exit(1);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

/* ---------------------------------------------------------------- assets */
// Map every shipped asset to a data URI up front, so both CSS url() and any
// src= attribute can be rewritten from the same table.
const assetUri = new Map();
const walk = dir => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    const ext = extname(name).toLowerCase();
    const mime = MIME[ext];
    if (!mime) continue;
    const b64 = readFileSync(full).toString('base64');
    assetUri.set(basename(name), `data:${mime};base64,${b64}`);
  }
};
walk(join(DIST, 'assets'));

const inlineAssets = text => {
  for (const [name, uri] of assetUri) {
    // Any path ending in this filename, quoted or in a url().
    text = text.replaceAll(new RegExp(`(?:\\.?/)?(?:[\\w./-]*/)?${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'g'), uri);
  }
  return text;
};

/* ------------------------------------------------------------ stylesheets */
let inlinedCss = 0;
html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/g, tag => {
  const href = /href=["']([^"']+)["']/.exec(tag)?.[1];
  if (!href) return tag;
  if (href.startsWith('http')) return tag;          // Google Fonts stays remote
  const file = join(DIST, href.replace(/^\//, ''));
  if (!existsSync(file)) return tag;
  inlinedCss++;
  return `<style>\n${inlineAssets(readFileSync(file, 'utf8'))}\n</style>`;
});

/* ---------------------------------------------------------------- scripts */
let inlinedJs = 0, jsBytes = 0;
html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/g, (tag, src) => {
  if (src.startsWith('http')) return '';            // no CDN survives
  const file = join(DIST, src.replace(/^\//, ''));
  if (!existsSync(file)) return '';
  const js = readFileSync(file, 'utf8');
  inlinedJs++; jsBytes += js.length;
  // type="module" is preserved: the bundle uses import.meta and top-level
  // await, neither of which is legal in a classic script.
  return `<script type="module">\n${js}\n</script>`;
});

/* --------------------------------------------------------------- clean up */
// <base href="/"> breaks a file:// open and is meaningless once everything is
// inline. Hash routing means nothing needs it.
html = html.replace(/<base[^>]*>/g, '');
html = inlineAssets(html);

writeFileSync(OUT, html);

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`
  ${OUT}

  scripts inlined   ${inlinedJs}  (${kb(jsBytes)})
  stylesheets       ${inlinedCss}
  assets embedded   ${assetUri.size}
  total             ${kb(html.length)}

  Self-contained. Opens from any host, or straight off the filesystem.
`);
