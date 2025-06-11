import fs from 'fs';
import { execSync } from 'child_process';

// Read the list of protected files
const protectedFiles = fs.readFileSync('.frontend-protected-files', 'utf8')
  .split('\n')
  .filter(line => line.trim());

// Get the list of files that are staged for commit
const stagedFiles = execSync('git diff --cached --name-only').toString()
  .split('\n')
  .filter(line => line.trim());

// Check if any of the staged files match the protected files
const modifiedProtectedFiles = stagedFiles.filter(file => 
  protectedFiles.some(protectedFile => file.includes(protectedFile))
);

// If there are protected files being modified, exit with an error
if (modifiedProtectedFiles.length > 0) {
  console.error('🚫 WARNING: You are modifying protected frontend files:');
  modifiedProtectedFiles.forEach(file => console.error(`  - ${file}`));
  console.error('🚫 Commit aborted. Use git commit --no-verify to bypass this check if necessary.');
  process.exit(1);
}

console.log('✅ No protected frontend files are being modified.');