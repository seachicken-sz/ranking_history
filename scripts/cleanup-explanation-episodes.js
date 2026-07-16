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
  const