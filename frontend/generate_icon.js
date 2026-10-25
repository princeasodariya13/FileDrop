const fs = require('fs');
const img = fs.readFileSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/public/logo.png');
const b64 = img.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <image href="data:image/png;base64,${b64}" x="2" y="2" height="96" width="96" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
fs.writeFileSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/app/icon.svg', svg);
try { fs.unlinkSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/app/icon.png'); } catch (e) { }
console.log('icon.svg updated with clean centered logo.');
