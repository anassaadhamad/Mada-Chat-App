const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { PNG } = require("pngjs");

const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = { r: 12, g: 10, b: 9 };

function solidPngBuffer(size) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      png.data[idx] = BG.r;
      png.data[idx + 1] = BG.g;
      png.data[idx + 2] = BG.b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

writeFileSync(join(outDir, "icon-192.png"), solidPngBuffer(192));
writeFileSync(join(outDir, "icon-512.png"), solidPngBuffer(512));
writeFileSync(join(outDir, "apple-touch-icon.png"), solidPngBuffer(180));
console.log("Wrote PWA icons to public/icons/");
