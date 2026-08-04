const fs = require('fs');
const path = require('path');

const srcDir = path.join(process.cwd(), 'frontend', 'src');

function getAllFiles(dirPath, arrayOfFiles) {
  let localFiles = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  localFiles.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(srcDir);

let updatedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Pattern: {options.map(opt => <option value={opt}>{opt}</option>)}
  // We need to be careful. The variable might not be named 'opt' or 'branch'.
  
  // Let's replace <option key={X} value={Y}>{Y}</option> pattern when mapping.
  // Actually, there's a simpler way. Let's look for `<option value={` and check if it's inside a map of branches/courses.
  
  // Let's replace the common pattern exactly:
  // value={branch}
  // {branch} inside option tags
  
  // 1. (branch) => <option value={branch}>{branch}</option>
  // We can use a regex that matches `.map((X) => <option ... value={X}>{X}</option>)`
  content = content.replace(/\.map\(\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*=>\s*([^<]*<option[^>]*value=\{)\1(\}[^>]*>)\{?\1\}?(<\/option>)/g, 
    '.map(($1) => $2$1.id || $1$3{$1.name || $1}$4');
    
  // Also match without parentheses around the parameter: .map(X => <option value={X}>{X}</option>)
  content = content.replace(/\.map\(\s*([a-zA-Z0-9_]+)\s*=>\s*([^<]*<option[^>]*value=\{)\1(\}[^>]*>)\{?\1\}?(<\/option>)/g, 
    '.map(($1) => $2$1.id || $1$3{$1.name || $1}$4');
    
  // Also match template literals like value={`report-branch-${b}`} -> wait, we need to handle this.
  // <option key={`report-branch-${b}`} value={b}>{b}</option>
  content = content.replace(/\.map\(\s*([a-zA-Z0-9_]+)\s*=>\s*(<option[^>]*value=\{)\1(\}[^>]*>)\{?\1\}?(<\/option>)/g, 
    '.map(($1) => $2$1.id || $1$3{$1.name || $1}$4');

  // Let's just do a specific string replacements for known cases
  const knownReplacements = [
    {
      find: '{[...new Set(filterOptions.branches || [])].map(b => <option key={`assign-branch-${b}`} value={b}>{b}</option>)}',
      replace: '{[...new Set(filterOptions.branches || [])].map(b => <option key={`assign-branch-${b.id || b}`} value={b.id || b}>{b.name || b}</option>)}'
    },
    {
      find: '{[...new Set(filterOptions.branches || [])].map(b => <option key={`report-branch-${b}`} value={b}>{b}</option>)}',
      replace: '{[...new Set(filterOptions.branches || [])].map(b => <option key={`report-branch-${b.id || b}`} value={b.id || b}>{b.name || b}</option>)}'
    },
    {
      find: '{periodFilterOptions.branches?.map(b => <option key={b} value={b}>{b}</option>)}',
      replace: '{periodFilterOptions.branches?.map(b => <option key={b.id || b} value={b.id || b}>{b.name || b}</option>)}'
    },
    {
      find: '{sourceOptions.branches.map(o => <option key={o.id} value={o.value}>{o.label}</option>)}',
      // Already correct if o is custom mapped, but check how sourceOptions is built
      replace: '{sourceOptions.branches.map(o => <option key={o.id} value={o.value}>{o.label}</option>)}'
    }
  ];

  knownReplacements.forEach(r => {
    content = content.replace(r.find, r.replace);
  });

  // What about: {(quickFilterOptions.branches || []).map((branch) => (
  // <option key={branch} value={branch}>{branch}</option>
  content = content.replace(/<option\s+key=\{([a-zA-Z0-9_]+)\}\s+value=\{\1\}>\s*\{\1\}\s*<\/option>/g, '<option key={$1.id || $1} value={$1.id || $1}>{$1.name || $1}</option>');

  // <option value={branch}>{branch}</option>
  content = content.replace(/<option\s+value=\{([a-zA-Z0-9_]+)\}>\s*\{\1\}\s*<\/option>/g, '<option value={$1.id || $1}>{$1.name || $1}</option>');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    updatedFiles++;
    console.log('Updated frontend component:', file.split('frontend\\\\src\\\\')[1] || file);
  }
});

console.log('Total files updated:', updatedFiles);
