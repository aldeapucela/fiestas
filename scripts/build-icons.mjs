// Generates a self-hosted Font Awesome subset (woff2 + CSS) with only the icons
// used in templates, scripts and styles. Run `npm run icons` after adding or
// removing icons; build.mjs fails if the manifest is out of date.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'src', 'assets', 'fontawesome');
const cssPath = path.join(root, 'src', 'styles', 'fontawesome-subset.css');
const manifestPath = path.join(outputDir, 'manifest.json');

const scanTargets = [
  'src/templates',
  'src/scripts',
  'src/styles',
  'src/pwa',
  'scripts/build.mjs'
];
const scanExcludes = new Set([cssPath]);
const nonIconSuffixes = new Set([
  'solid', 'regular', 'brands', 'fw', 'spin', 'pulse', 'beat', 'fade', 'flip', 'shake', 'bounce',
  'lg', 'xs', 'sm', 'xl', '1x', '2x', '3x', '2xl', 'ul', 'li', 'stack', 'inverse', 'border',
  // Nombres de los ficheros de fuente (fa-solid-900.woff2, etc.), no iconos.
  'solid-900', 'regular-400', 'brands-400'
]);

async function walk(target) {
  const stats = await fs.stat(target);
  if (stats.isFile()) return [target];
  const entries = await fs.readdir(target, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => walk(path.join(target, entry.name))));
  return files.flat();
}

export async function scanUsedIcons() {
  const names = new Set();
  for (const target of scanTargets) {
    for (const file of await walk(path.join(root, target))) {
      if (scanExcludes.has(file)) continue;
      const content = await fs.readFile(file, 'utf8');
      for (const match of content.matchAll(/fa-([a-z0-9][a-z0-9-]*)/g)) {
        if (!nonIconSuffixes.has(match[1])) names.add(match[1]);
      }
    }
  }
  return [...names].sort();
}

export async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
}

async function generate() {
  const { fontawesomeSubset } = await import('fontawesome-subset');
  const metadata = JSON.parse(await fs.readFile(
    path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free', 'metadata', 'icon-families.json'),
    'utf8'
  ));

  const used = await scanUsedIcons();
  const subset = { solid: [], regular: [], brands: [] };
  const unicodes = {};
  const missing = [];
  for (const name of used) {
    const styles = (metadata[name]?.familyStylesByLicense?.free || []).map((entry) => entry.style);
    if (!styles.length) { missing.push(name); continue; }
    for (const style of styles) subset[style]?.push(name);
    unicodes[name] = metadata[name].unicode;
  }
  if (missing.length) console.warn('Sin glifo en Font Awesome Free (se omiten):', missing.join(', '));

  await fs.rm(outputDir, { recursive: true, force: true });
  await fontawesomeSubset(subset, outputDir, { targetFormats: ['woff2'] });

  const css = [
    '/* Generado por scripts/build-icons.mjs - no editar a mano. */',
    // font-display:block como el all.min.css original: un icono sin fuente debe ser invisible, nunca "tofu".
    '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;src:url("/assets/fontawesome/fa-solid-900.woff2") format("woff2")}',
    '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:400;font-display:block;src:url("/assets/fontawesome/fa-regular-400.woff2") format("woff2")}',
    '@font-face{font-family:"Font Awesome 6 Brands";font-style:normal;font-weight:400;font-display:block;src:url("/assets/fontawesome/fa-brands-400.woff2") format("woff2")}',
    '.fa,.fa-solid,.fa-regular,.fa-brands{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;display:inline-block;font-style:normal;font-variant:normal;line-height:1;text-rendering:auto}',
    '.fa,.fa-solid{font-family:"Font Awesome 6 Free";font-weight:900}',
    '.fa-regular{font-family:"Font Awesome 6 Free";font-weight:400}',
    '.fa-brands{font-family:"Font Awesome 6 Brands";font-weight:400}',
    ...Object.entries(unicodes).map(([name, unicode]) => `.fa-${name}::before{content:"\\${unicode}"}`)
  ].join('\n') + '\n';
  await fs.writeFile(cssPath, css);
  await fs.writeFile(manifestPath, JSON.stringify({ icons: Object.keys(unicodes).sort(), skipped: missing }, null, 2) + '\n');
  console.log(`Subset generado: ${subset.solid.length} solid, ${subset.regular.length} regular, ${subset.brands.length} brands.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
