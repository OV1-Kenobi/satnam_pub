import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Debug information
console.log('🔍 Starting frontend protection check...');

// Read the list of protected files
const protectedFilesPath = path.resolve('.frontend-protected-files');
console.log(`📋 Reading protected files from: ${protectedFilesPath}`);

if (!fs.existsSync(protectedFilesPath)) {
  console.error(`❌ Protected files list not found at: ${protectedFilesPath}`);
  process.exit(1);
}

const protectedFiles = fs.readFileSync(protectedFilesPath, 'utf8')
  .split('\n')
  .filter(line => line.trim());

console.log(`📋 Protected files (${protectedFiles.length}):`);
protectedFiles.forEach(file => console.log(`  - ${file}`));

// Get the list of files that are staged for commit
const stagedFilesOutput = execSync('git diff --cached --name-only').toString();
const stagedFiles = stagedFilesOutput
  .split('\n')
  .filter(line => line.trim());

console.log(`📋 Staged files (${stagedFiles.length}):`);
stagedFiles.forEach(file => console.log(`  - ${file}`));

// Check if any of the staged files match the protected files
const modifiedProtectedFiles = [];
for (const stagedFile of stagedFiles) {
  for (const protectedFile of protectedFiles) {
    // Exact match
    if (stagedFile === protectedFile) {
      console.log(`⚠️ Exact match found: ${stagedFile} matches protected file: ${protectedFile}`);
      modifiedProtectedFiles.push(stagedFile);
      break;
    }
    
    // Check if the staged file is a protected file (with or without directory prefix)
    const stagedFileParts = stagedFile.split('/');
    const protectedFileParts = protectedFile.split('/');
    const stagedFileName = stagedFileParts[stagedFileParts.length - 1];
    const protectedFileName = protectedFileParts[protectedFileParts.length - 1];
    
    if (stagedFileName === protectedFileName) {
      console.log(`⚠️ Filename match found: ${stagedFile} matches protected file: ${protectedFile}`);
      modifiedProtectedFiles.push(stagedFile);
      break;
    }
    
    // Check if the staged file is in a protected directory
    if (protectedFile.includes('/') && stagedFile.includes(protectedFile.split('/')[0])) {
      console.log(`⚠️ Directory match found: ${stagedFile} is in protected directory: ${protectedFile.split('/')[0]}`);
      modifiedProtectedFiles.push(stagedFile);
      break;
    }
  }
}

// If there are protected files being modified, exit with an error
if (modifiedProtectedFiles.length > 0) {
  console.error('🚫 WARNING: You are modifying protected frontend files:');
  modifiedProtectedFiles.forEach(file => console.error(`  - ${file}`));
  console.error('🚫 Commit aborted. Use git commit --no-verify to bypass this check if necessary.');
  process.exit(1);
}

console.log('✅ No protected frontend files are being modified.');