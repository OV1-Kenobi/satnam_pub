const fs = require('fs');

const filePath = 'src/components/admin/HierarchicalAdminDashboard.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// The file has a malformed structure with duplicate tab maps
// We need to remove the first broken one and keep the second correct one

// Find and remove the malformed section
// It starts with a button inside the error alert and ends with the first ))}

// Replace the entire malformed section with proper structure
const malformedPattern = /if \(!dashboardData\) \{[\s\S]*?<button[\s\S]*?key=\{tab\.id\}[\s\S]*?\)\)\}[\s\S]*?<div>[\s\S]*?<h1 className="text-3xl font-bold">Admin Dashboard<\/h1>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>\s*>\s*\n\n\s*\{\/\* Error Alert \*\/ \}/;

// Actually, let's use a simpler approach - just remove the broken lines
const lines = content.split('\n');
const fixedLines = [];
let inBrokenSection = false;
let brokenSectionStart = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Detect start of broken section - button with key={tab.id} inside error alert check
  if (trimmed.startsWith('key={tab.id}') && i > 0 && lines[i-1].includes('!dashboardData')) {
    inBrokenSection = true;
    brokenSectionStart = i - 1;
    // Skip back and remove the previous lines that are part of the broken section
    while (fixedLines.length > 0 && !fixedLines[fixedLines.length - 1].includes('if (!dashboardData)')) {
      fixedLines.pop();
    }
    // Remove the "if (!dashboardData)" line too
    if (fixedLines.length > 0 && fixedLines[fixedLines.length - 1].includes('if (!dashboardData)')) {
      fixedLines.pop();
    }
    continue;
  }
  
  // Detect end of broken section - the first ))} after broken section starts
  if (inBrokenSection && trimmed === '))}') {
    inBrokenSection = false;
    // Skip this line and the next few lines until we get to the proper structure
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === '' || lines[j].includes('<div>') || lines[j].includes('<h1') || lines[j].includes('Admin Dashboard') || lines[j].includes('Role:') || lines[j].includes('</div>') || lines[j].includes('</p>'))) {
      j++;
    }
    i = j - 1;
    continue;
  }
  
  if (!inBrokenSection) {
    fixedLines.push(line);
  }
}

// Also fix the spacing issues
let result = fixedLines.join('\n');
result = result.replace('</div >', '</div>');
result = result.replace('{/* Error Alert */ }', '{/* Error Alert */}');
result = result.replace(/}\s*\n\s*\{\s*\n\s*error && \(/g, '}\n\n      {/* Error Alert */}\n      {error && (');

fs.writeFileSync(filePath, result, 'utf-8');
console.log('Fixed!');

