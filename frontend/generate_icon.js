const fs = require('fs');
const img = fs.readFileSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/public/logo-512.png');
const b64 = img.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <image href="data:image/png;base64,${b64}" x="0" y="0" height="100" width="100" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
fs.writeFileSync('c:/Users/Prince/Desktop/FileDrop/FileDrop/frontend/app/icon.svg', svg);
console.log('icon.svg updated for full logo visibility.');
