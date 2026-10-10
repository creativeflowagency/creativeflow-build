// Copies the app (src/) into ios-www/, the folder the iPhone app (Capacitor) bundles.
// Capacitor opens index.html, so slate.html is also copied there. The offline-cache file
// (sw.js) is left out: the iPhone app already has every file on the phone.
// Run by the iOS build (.github/workflows/ios-build.yml); safe to run locally too.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const out = path.join(root, 'ios-www');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.rmSync(path.join(out, 'sw.js'), { force: true });
fs.copyFileSync(path.join(out, 'slate.html'), path.join(out, 'index.html'));
console.log('ios-www ready');
