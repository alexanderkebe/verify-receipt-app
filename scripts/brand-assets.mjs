/**
 * Generates optimized brand assets from the raw Logos/ sources.
 *
 *   Web  → public/brand/{mark,mark-192,logo-blue,logo-dark,logo-light,
 *          splash-dark,splash-light}.png
 *   App  → mobile/assets/{icon,login-logo,login-logo-light,adaptive-icon,
 *          splash-dark,splash-light}.png
 *
 * Run from the project root:  node scripts/brand-assets.mjs
 * Re-run it after the designer swaps any file in Logos/.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const LOGOS = path.resolve('Logos');
const WEB = path.resolve('public/brand');
const APP = path.resolve('mobile/assets');

fs.mkdirSync(WEB, { recursive: true });
fs.mkdirSync(APP, { recursive: true });

async function write(src, destDir, name, size) {
  await sharp(path.join(LOGOS, src))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(destDir, `${name}.png`));
}

/**
 * Android adaptive icon foreground: `src` scaled to fit the ~66% safe zone,
 * centered on a transparent `size`×`size` canvas. The launcher masks/crops the
 * outer ~33%, so keeping the artwork inside the safe zone guarantees nothing is clipped.
 */
async function writeAdaptiveIcon(src, destDir, name, size) {
  const inner = Math.round(size * 0.66);
  const padding = Math.round((size - inner) / 2);
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp(path.join(LOGOS, src)).resize(inner, inner, { fit: 'cover' }).png().toBuffer(),
        left: padding,
        top: padding,
      },
    ])
    .png()
    .toFile(path.join(destDir, `${name}.png`));
}

/** Bounding box (full-res coords) of non-transparent content in a logo file. */
async function contentBounds(src) {
  const meta = await sharp(path.join(LOGOS, src)).metadata();
  const { data, info } = await sharp(path.join(LOGOS, src))
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sx = info.width / meta.width;
  const sy = info.height / meta.height;
  let minX = meta.width, minY = meta.height, maxX = 0, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 40) {
        minX = Math.min(minX, x / sx); maxX = Math.max(maxX, x / sx);
        minY = Math.min(minY, y / sy); maxY = Math.max(maxY, y / sy);
      }
    }
  }
  return { left: Math.floor(minX), top: Math.floor(minY), width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) };
}

/** Trim transparent margins, then scale the content to `size` wide (height auto). */
async function writeTrimmed(src, destDir, name, size) {
  const bounds = await contentBounds(src);
  await sharp(path.join(LOGOS, src))
    .extract(bounds)
    .resize({ width: size, withoutEnlargement: true })
    .png()
    .toFile(path.join(destDir, `${name}.png`));
}

async function main() {
  // Web
  await write('light-splash.png', WEB, 'mark', 512);
  await write('light-splash.png', WEB, 'mark-192', 192);
  await write('light-mode.png', WEB, 'logo-blue', 512);
  // Themed navbar lockups: white lockup for dark surfaces, blue lockup for light.
  await writeTrimmed('dark-mode.png', WEB, 'logo-dark', 640);
  await writeTrimmed('light-mode.png', WEB, 'logo-light', 640);
  // Themed splash marks: white mark for the dark splash, blue mark for the light splash.
  await writeTrimmed('dark-splash.png', WEB, 'splash-dark', 512);
  await writeTrimmed('light-splash.png', WEB, 'splash-light', 512);

  // Mobile
  // App icon: full-bleed square from the home-screen mockup (white bg, blue D + green check —
  // much better contrast than the old blue-on-blue icon that came from light-splash.png).
  await write('homeScreen.jpg', APP, 'icon', 1024);
  // Login title logo: white lockup trimmed to its content (no margins) for crisp scaling.
  await sharp(path.join(LOGOS, 'deresegn-02.png'))
    .trim()
    .resize({ width: 1080, withoutEnlargement: true })
    .png()
    .toFile(path.join(APP, 'login-logo.png'));
  // Blue lockup for the login screen in light mode (white lockup is invisible on light bg).
  await writeTrimmed('light-mode.png', APP, 'login-logo-light', 1080);
  // Android adaptive foreground: artwork scaled into the ~66% safe zone on a transparent canvas
  // so the circular launcher mask never clips the D. Pairs with backgroundColor #FFFFFF in app.json.
  await writeAdaptiveIcon('homeScreen.jpg', APP, 'adaptive-icon', 1024);
  // Themed splash marks: white mark for the dark splash, blue mark for the light splash.
  await writeTrimmed('dark-splash.png', APP, 'splash-dark', 1024);
  await writeTrimmed('light-splash.png', APP, 'splash-light', 1024);

  console.log('OK — assets written to public/brand/ and mobile/assets/');
  console.log('adaptive-icon backgroundColor (set in app.json): #FFFFFF');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
