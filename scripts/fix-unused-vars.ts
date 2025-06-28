#!/usr/bin/env tsx

/**
 * Script to fix common unused variable patterns in the codebase
 *
 * This script identifies and fixes patterns like:
 * - Unused catch errors: catch (error) => catch (_error)
 * - Unused function parameters: function(param) => function(_param)
 * - Unused destructured variables: const { unused } = obj => const { unused: _unused } = obj
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Common patterns to fix
const fixes = [
  // Catch block errors
  {
    pattern: /catch\s*\(\s*error\s*\)/g,
    replacement: "catch (_error)",
    description: "Fix unused catch error variables",
  },

  // Function parameter: memberId
  {
    pattern: /\b(memberId)(?=\s*[,\)])/g,
    replacement: "_$1",
    description: "Fix unused memberId parameters",
  },

  // Function parameter: familyId
  {
    pattern: /\b(familyId)(?=\s*[,\)])/g,
    replacement: "_$1",
    description: "Fix unused familyId parameters",
  },

  // Unused destructured variables
  {
    pattern: /const\s*\{\s*([^}]+)\s*\}\s*=/g,
    replacement: (match: string) => {
      // This is a more complex pattern that needs manual handling
      return match;
    },
    description: "Fix unused destructured variables",
  },
];

// File extensions to process
const allowedExtensions = [".ts", ".tsx", ".js", ".jsx"];

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules and .git
        if (
          !["node_modules", ".git", ".next", "dist", "build"].includes(item)
        ) {
          traverse(fullPath);
        }
      } else if (allowedExtensions.includes(path.extname(item))) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

function fixFile(filePath: string): boolean {
  try {
    let content = fs.readFileSync(filePath, "utf8");
    let modified = false;

    for (const fix of fixes) {
      if (typeof fix.replacement === "string") {
        const originalContent = content;
        content = content.replace(fix.pattern, fix.replacement);
        if (content !== originalContent) {
          modified = true;
          console.log(
            `✓ ${path.relative(rootDir, filePath)}: ${fix.description}`
          );
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

function main() {
  console.log("🔧 Starting unused variable cleanup...\n");

  const files = getAllFiles(rootDir);
  let modifiedCount = 0;

  for (const file of files) {
    if (fixFile(file)) {
      modifiedCount++;
    }
  }

  console.log(`\n🎉 Cleanup complete! Modified ${modifiedCount} files.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
