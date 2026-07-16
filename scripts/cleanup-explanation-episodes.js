const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data_favorite');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const TARGET = '【解説放送版】';

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
let removedTotal = 0;
let changedFiles = 0;

for (const file of manifest.files || []) {
  const filePath = path.join(DATA_DIR, file.path);

  if (!fs.existsSync(filePath)) {
    console.warn(`skip missing file: ${file.path}`);
    continue;
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const rows = Array.isArray(json.rows) ? json.rows : [];
  const filtered = rows.filter((row) => {
    return !String(row && row.episodeTitle || '').includes(TARGET);
  });

  const removed = rows.length - filtered.length;

  if (removed > 0) {
    json.rows = filtered;
    fs.writeFileSync(filePath, JSON.stringify(json), 'utf8');
    removedTotal += removed;
    changedFiles += 1;
    console.log(`${file.path}: removed ${removed}`);
  }

  file.rowCount = filtered.length;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest), 'utf8');

console.log(JSON.stringify({
  target: TARGET,
  changedFiles,
  removedTotal
}, null, 2));
