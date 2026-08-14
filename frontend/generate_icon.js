const fs = require('fs');
const img = fs.readFileSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/public/logo.png');
const b64 = img.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <image href="data:image/png;base64,${b64}" x="-75" y="-75" height="250" width="250" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
fs.writeFileSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/app/icon.svg', svg);
try { fs.unlinkSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/app/icon.png'); } catch (e) { }
