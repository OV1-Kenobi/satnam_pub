#!/usr/bin/env node
/**
 * Vite Chunk Dependency Analyzer
 * 
 * Analyzes production build output to map chunk dependencies,
 * identify potential TDZ-causing cross-chunk imports, and
 * visualize the module initialization order.
 * 
 * Usage: node scripts/analyze-chunks.js [--graph] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'assets');

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');

/**
 * Analyze a chunk file for imports and exports
 */
function analyzeChunk(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  
  // Find dynamic imports to other chunks
  const dynamicImports = [];
  const importPattern = /import\s*\(\s*["']\.\/([^"']+)["']\s*\)/g;
  let match;
  while ((match = importPattern.exec(content)) !== null) {
    dynamicImports.push(match[1]);
  }
  
  // Find static imports (references to other chunk files)
  const chunkRefs = [];
  const chunkRefPattern = /["']\.\/([a-zA-Z0-9_-]+-[A-Za-z0-9_-]+\.js)["']/g;
  while ((match = chunkRefPattern.exec(content)) !== null) {
    if (match[1] !== fileName) {
      chunkRefs.push(match[1]);
    }
  }
  
  // Detect potential TDZ patterns in minified code
  const tdzRisks = [];
  
  // Look for React.createContext patterns
  if (content.includes('createContext') && !content.includes('React.createContext')) {
    tdzRisks.push('Destructured createContext detected');
  }
  
  // Look for module-level variable access before function definitions
  const earlyVarPattern = /^var\s+\w+\s*=\s*\w+\./gm;
  if (earlyVarPattern.test(content.substring(0, 500))) {
    tdzRisks.push('Early module-level variable initialization');
  }

  // Detect CEPS  secureNsecManager cross-layer cycle within the same chunk
  const hasCepsIdentifier = content.includes('central_event_publishing_service');
  const hasSecureNsecManager = content.includes('secureNsecManager');
  const hasCepsSecureCycle = hasCepsIdentifier && hasSecureNsecManager;
  if (hasCepsSecureCycle) {
    tdzRisks.push(
      'CEPS  secureNsecManager cross-layer cycle detected in same chunk'
    );
  }

  // Look for singleton factory patterns near the start of the chunk
  const header = content.substring(0, 1000);
  const hasSingletonHeader = /getInstance\s*\(/.test(header);
  if (hasSingletonHeader) {
    tdzRisks.push('Module-level singleton getInstance() pattern near chunk start');
  }

  // Flag high-risk TDZ combinations: CEPS/Nsec cycle + singleton initialization
  const highRiskTdz = hasCepsSecureCycle && hasSingletonHeader;
  
  return {
    name: fileName,
    size: content.length,
    dynamicImports,
    chunkRefs: [...new Set(chunkRefs)],
    tdzRisks,
    highRiskTdz,
    hasReact: content.includes('react') || content.includes('React'),
    hasContext: content.includes('Context') || content.includes('createContext'),
  };
}

/**
 * Build dependency graph from chunk analysis
 */
function buildDependencyGraph(chunks) {
  const graph = {};
  const reverseGraph = {};
  
  for (const chunk of chunks) {
    graph[chunk.name] = chunk.chunkRefs;
    
    for (const ref of chunk.chunkRefs) {
      if (!reverseGraph[ref]) {
        reverseGraph[ref] = [];
      }
      reverseGraph[ref].push(chunk.name);
    }
  }
  
  return { graph, reverseGraph };
}

/**
 * Find circular dependencies
 */
function findCircularDeps(graph) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];
  
  function dfs(node, path = []) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;
    
    visited.add(node);
    stack.add(node);
    path.push(node);
    
    const deps = graph[node] || [];
    for (const dep of deps) {
      dfs(dep, [...path]);
    }
    
    stack.delete(node);
  }
  
  for (const node of Object.keys(graph)) {
    dfs(node);
  }
  
  return cycles;
}

function main() {
  console.log('📦 Vite Chunk Dependency Analyzer');
  console.log('='.repeat(50));
  
  // Check if dist exists
  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/assets directory not found. Run `npm run build` first.');
    process.exit(1);
  }
  
  // Get all JS chunk files
  const jsFiles = fs.readdirSync(distDir)
    .filter(f => f.endsWith('.js') && !f.endsWith('.map'))
    .map(f => path.join(distDir, f));
  
  console.log(`Found ${jsFiles.length} JavaScript chunks\n`);
  
  // Analyze each chunk
  const chunks = jsFiles.map(analyzeChunk);
  
  // Sort by size
  chunks.sort((a, b) => b.size - a.size);
  
  // Display chunk info
  console.log('📊 Chunk Analysis:');
  console.log('-'.repeat(50));
  
  for (const chunk of chunks) {
    const sizeKB = (chunk.size / 1024).toFixed(1);
    const flags = [];
    if (chunk.hasReact) flags.push('React');
    if (chunk.hasContext) flags.push('Context');
    if (chunk.tdzRisks.length > 0) {
      flags.push(chunk.highRiskTdz ? '🔥High-TDZ-Risk' : '⚠️TDZ-Risk');
    }
    
    console.log(`  ${chunk.name} (${sizeKB} KB) ${flags.length ? `[${flags.join(', ')}]` : ''}`);
    
    if (verbose && chunk.chunkRefs.length > 0) {
      console.log(`    → depends on: ${chunk.chunkRefs.join(', ')}`);
    }
    
    if (chunk.tdzRisks.length > 0) {
      for (const risk of chunk.tdzRisks) {
        console.log(`    ⚠️  ${risk}`);
      }
    }
  }
  
  // Build and analyze dependency graph
  const { graph, reverseGraph } = buildDependencyGraph(chunks);
  const cycles = findCircularDeps(graph);
  
  if (cycles.length > 0) {
    console.log('\n🔄 Circular Dependencies Detected:');
    console.log('-'.repeat(50));
    for (const cycle of cycles) {
      console.log(`  ${cycle.join(' → ')}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Chunks with React: ${chunks.filter(c => c.hasReact).length}`);
  console.log(`Chunks with Context: ${chunks.filter(c => c.hasContext).length}`);
  console.log(`Chunks with TDZ risks: ${chunks.filter(c => c.tdzRisks.length > 0).length}`);
  console.log(`Circular dependencies: ${cycles.length}`);
  
  const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
  console.log(`Total JS size: ${(totalSize / 1024).toFixed(1)} KB`);
}

main();

