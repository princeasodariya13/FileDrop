const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.next')) {
        results = results.concat(walk(file));
      }
    } else {
      results.push(file);
    }
  });
  return results;
}
const files = walk('frontend').filter(f => f.endsWith('.tsx'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/bg-white\/10/g, 'bg-surface-hover');
  content = content.replace(/bg-white\/5/g, 'bg-surface');
  content = content.replace(/border-white\/10/g, 'border-surface-hover');
  content = content.replace(/border-white\/5/g, 'border-surface');
  fs.writeFileSync(f, content);
});
console.log('Replaced successfully.');
