const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');
const OUTPUT = path.join(__dirname, '..', 'public', 'media-manifest.json');
const SUPPORTED_EXT = new Set(['.mp4', '.webm', '.mov']);

if (!fs.existsSync(MEDIA_DIR)) {
  fs.writeFileSync(OUTPUT, '[]');
  process.exit(0);
}

const files = fs.readdirSync(MEDIA_DIR)
  .filter(f => !fs.statSync(path.join(MEDIA_DIR, f)).isDirectory())
  .filter(f => SUPPORTED_EXT.has(path.extname(f).toLowerCase()))
  .map(f => ({
    src: `/media/${f}`,
    type: 'video',
    playMode: 'loop',
    invert: false,
  }));

fs.writeFileSync(OUTPUT, JSON.stringify(files, null, 2));
console.log(`Media manifest: ${files.length} items written to public/media-manifest.json`);
