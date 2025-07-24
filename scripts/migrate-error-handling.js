#!/usr/bin/env node

/**
 * Migration Script: Update API Endpoints to Use Centralized Error Handler
 * 
 * This script helps migrate existing API endpoints to use the new
 * centralized ApiErrorHandler for consistent, privacy-safe error responses.
 * 
 * Usage: node scripts/migrate-error-handling.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory (one level up from scripts)
const rootDir = path.join(__dirname, '..');
const apiDir = path.join(rootDir, 'api');

/**
 * Find all JavaScript files in the API directory
 */
function findApiFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      findApiFiles(fullPath, files);
    } else if (item.endsWith('.js') && !item.includes('test')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Check if file already uses the centralized error handler
 */
function usesApiErrorHandler(content) {
  return content.includes('ApiErrorHandler') || content.includes('import { ApiErrorHandler }');
}

/**
 * Get the appropriate import statement based on file location
 */
function getImportStatement(filePath) {
  const relativePath = path.relative(path.dirname(filePath), path.join(rootDir, 'lib', 'error-handler.js'));
  const importPath = relativePath.replace(/\\/g, '/'); // Convert to forward slashes
  return `import { ApiErrorHandler } from '${importPath}';`;
}

/**
 * Analyze error handling patterns in a file
 */
function analyzeErrorHandling(filePath, content) {
  const analysis = {
    filePath,
    hasErrorHandling: false,
    usesApiErrorHandler: usesApiErrorHandler(content),
    errorPatterns: [],
    needsMigration: false
  };

  // Common error handling patterns to look for
  const patterns = [
    {
      pattern: /res\.status\(\d+\)\.json\(\s*{\s*error:/g,
      description: 'Direct error response'
    },
    {
      pattern: /console\.error.*res\.status\(\d+\)\.json/gs,
      description: 'Console error + response'
    },
    {
      pattern: /catch\s*\([^)]*\)\s*{[^}]*res\.status/gs,
      description: 'Catch block with direct response'
    },
    {
      pattern: /throw new Error.*catch/gs,
      description: 'Error throwing pattern'
    }
  ];

  for (const { pattern, description } of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      analysis.hasErrorHandling = true;
      analysis.errorPatterns.push({
        description,
        count: matches.length,
        examples: matches.slice(0, 2) // Show first 2 examples
      });
    }
  }

  // Determine if migration is needed
  analysis.needsMigration = analysis.hasErrorHandling && !analysis.usesApiErrorHandler;

  return analysis;
}

/**
 * Generate migration suggestions for a file
 */
function generateMigrationSuggestions(analysis) {
  if (!analysis.needsMigration) {
    return null;
  }

  const suggestions = {
    filePath: analysis.filePath,
    steps: []
  };

  // Step 1: Add import
  if (!analysis.usesApiErrorHandler) {
    suggestions.steps.push({
      type: 'import',
      description: 'Add ApiErrorHandler import',
      code: getImportStatement(analysis.filePath)
    });
  }

  // Step 2: Replace error patterns
  for (const pattern of analysis.errorPatterns) {
    suggestions.steps.push({
      type: 'replace',
      description: `Replace ${pattern.description}`,
      from: 'res.status(500).json({ error: "..." })',
      to: 'ApiErrorHandler.handleApiError(error, res, "operation context")'
    });
  }

  return suggestions;
}

/**
 * Main migration analysis
 */
function main() {
  console.log('🔍 Analyzing API endpoints for error handling migration...\n');

  const apiFiles = findApiFiles(apiDir);
  const analyses = [];
  
  for (const filePath of apiFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const analysis = analyzeErrorHandling(filePath, content);
      analyses.push(analysis);
    } catch (error) {
      console.error(`❌ Error reading ${filePath}:`, error.message);
    }
  }

  // Summary statistics
  const totalFiles = analyses.length;
  const filesNeedingMigration = analyses.filter(a => a.needsMigration).length;
  const filesAlreadyMigrated = analyses.filter(a => a.usesApiErrorHandler).length;
  const filesWithoutErrorHandling = analyses.filter(a => !a.hasErrorHandling).length;

  console.log('📊 Migration Analysis Summary:');
  console.log(`   Total API files: ${totalFiles}`);
  console.log(`   Already using ApiErrorHandler: ${filesAlreadyMigrated}`);
  console.log(`   Need migration: ${filesNeedingMigration}`);
  console.log(`   No error handling found: ${filesWithoutErrorHandling}\n`);

  // Show files that need migration
  if (filesNeedingMigration > 0) {
    console.log('🚀 Files requiring migration:\n');
    
    for (const analysis of analyses.filter(a => a.needsMigration)) {
      const relativePath = path.relative(rootDir, analysis.filePath);
      console.log(`📁 ${relativePath}`);
      
      for (const pattern of analysis.errorPatterns) {
        console.log(`   • ${pattern.description}: ${pattern.count} instances`);
      }
      
      console.log(`   📝 Migration steps:`);
      const suggestions = generateMigrationSuggestions(analysis);
      
      if (suggestions) {
        for (const step of suggestions.steps) {
          console.log(`      ${step.type === 'import' ? '📥' : '🔄'} ${step.description}`);
          if (step.code) {
            console.log(`         ${step.code}`);
          } else if (step.from && step.to) {
            console.log(`         From: ${step.from}`);
            console.log(`         To:   ${step.to}`);
          }
        }
      }
      console.log('');
    }
  }

  // Show examples of properly migrated files
  if (filesAlreadyMigrated > 0) {
    console.log('✅ Files already using centralized error handling:');
    for (const analysis of analyses.filter(a => a.usesApiErrorHandler)) {
      const relativePath = path.relative(rootDir, analysis.filePath);
      console.log(`   • ${relativePath}`);
    }
    console.log('');
  }

  // Migration instructions
  console.log('📚 Manual Migration Steps:');
  console.log('');
  console.log('1. Add import statement:');
  console.log('   import { ApiErrorHandler } from "../../lib/error-handler.js";');
  console.log('');
  console.log('2. Replace error handling patterns:');
  console.log(`   
   // ❌ OLD WAY (exposes details):
   catch (error) {
     console.error("Error:", error);
     res.status(500).json({ 
       error: "Failed to process", 
       details: error.message 
     });
   }

   // ✅ NEW WAY (privacy-safe):
   catch (error) {
     ApiErrorHandler.handleApiError(
       error,
       res,
       "process request"
     );
   }`);
  console.log('');
  console.log('3. For validation errors:');
  console.log(`   
   // ❌ OLD WAY:
   if (!username) {
     return res.status(400).json({ error: "Username required" });
   }

   // ✅ NEW WAY:
   if (!username) {
     return ApiErrorHandler.handleError(
       new Error("Username required"),
       res,
       "validate request",
       400
     );
   }`);
  
  console.log('\n🎯 Next Steps:');
  console.log('   1. Review the files listed above');
  console.log('   2. Apply the migration patterns manually');
  console.log('   3. Test each endpoint after migration');
  console.log('   4. Verify error responses are sanitized in production');
  console.log('\n✨ Benefits after migration:');
  console.log('   • Consistent error responses across all endpoints');
  console.log('   • Privacy-safe error handling (no sensitive data exposure)');
  console.log('   • Proper error logging with request tracking');
  console.log('   • Production-ready error sanitization');
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { analyzeErrorHandling, generateMigrationSuggestions };
