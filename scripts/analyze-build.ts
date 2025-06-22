// Build analysis script to monitor chunk sizes and optimization
// File: scripts/analyze-build.ts

import { readdirSync, statSync } from "fs";
import { join } from "path";

interface ChunkInfo {
  name: string;
  size: number;
  gzipSize?: number;
  type: "js" | "css" | "other";
}

interface BuildAnalysis {
  totalSize: number;
  totalGzipSize: number;
  chunks: ChunkInfo[];
  recommendations: string[];
}

/**
 * Analyze the build output and provide optimization recommendations
 */
export function analyzeBuild(distPath: string = "dist"): BuildAnalysis {
  const assetsPath = join(distPath, "assets");
  const chunks: ChunkInfo[] = [];
  let totalSize = 0;
  const totalGzipSize = 0;

  try {
    const files = readdirSync(assetsPath);

    for (const file of files) {
      const filePath = join(assetsPath, file);
      const stats = statSync(filePath);

      const chunk: ChunkInfo = {
        name: file,
        size: stats.size,
        type: file.endsWith(".js")
          ? "js"
          : file.endsWith(".css")
            ? "css"
            : "other",
      };

      chunks.push(chunk);
      totalSize += stats.size;
    }

    // Sort chunks by size (largest first)
    chunks.sort((a, b) => b.size - a.size);
  } catch (error) {
    console.error("Error analyzing build:", error);
  }

  const recommendations = generateRecommendations(chunks);

  return {
    totalSize,
    totalGzipSize,
    chunks,
    recommendations,
  };
}

/**
 * Generate optimization recommendations based on chunk analysis
 */
function generateRecommendations(chunks: ChunkInfo[]): string[] {
  const recommendations: string[] = [];
  const jsChunks = chunks.filter((c) => c.type === "js");

  // Check for oversized chunks
  const largeChunks = jsChunks.filter((c) => c.size > 500 * 1024); // 500KB
  if (largeChunks.length > 0) {
    recommendations.push(
      `⚠️  Large chunks detected (>500KB): ${largeChunks.map((c) => c.name).join(", ")}`
    );
    recommendations.push(
      "💡 Consider further splitting these chunks using dynamic imports"
    );
  }

  // Check for too many small chunks
  const smallChunks = jsChunks.filter((c) => c.size < 10 * 1024); // 10KB
  if (smallChunks.length > 10) {
    recommendations.push(
      `⚠️  Many small chunks detected (${smallChunks.length} chunks <10KB)`
    );
    recommendations.push(
      "💡 Consider combining some small chunks to reduce HTTP requests"
    );
  }

  // Check crypto chunk distribution
  const cryptoChunks = jsChunks.filter((c) => c.name.includes("crypto"));
  if (cryptoChunks.length > 0) {
    const totalCryptoSize = cryptoChunks.reduce((sum, c) => sum + c.size, 0);
    const avgCryptoSize = totalCryptoSize / cryptoChunks.length;

    if (avgCryptoSize > 300 * 1024) {
      // 300KB average
      recommendations.push("⚠️  Crypto chunks are quite large on average");
      recommendations.push("💡 Consider more granular crypto module splitting");
    }
  }

  // Check vendor chunk sizes
  const vendorChunks = jsChunks.filter((c) => c.name.includes("vendor"));
  const largeVendorChunks = vendorChunks.filter((c) => c.size > 400 * 1024);
  if (largeVendorChunks.length > 0) {
    recommendations.push(
      `⚠️  Large vendor chunks: ${largeVendorChunks.map((c) => c.name).join(", ")}`
    );
    recommendations.push("💡 Consider splitting vendor dependencies further");
  }

  if (recommendations.length === 0) {
    recommendations.push("✅ Build optimization looks good!");
  }

  return recommendations;
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  const sizes = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Print build analysis report
 */
export function printBuildAnalysis(analysis: BuildAnalysis): void {
  console.log("\n🔍 Build Analysis Report");
  console.log("========================\n");

  console.log(`📊 Total Size: ${formatSize(analysis.totalSize)}`);
  if (analysis.totalGzipSize > 0) {
    console.log(`📦 Total Gzipped: ${formatSize(analysis.totalGzipSize)}`);
  }
  console.log(`📁 Total Chunks: ${analysis.chunks.length}\n`);

  console.log("📋 Chunk Breakdown:");
  console.log("-------------------");

  const jsChunks = analysis.chunks.filter((c) => c.type === "js");
  const cssChunks = analysis.chunks.filter((c) => c.type === "css");
  const otherChunks = analysis.chunks.filter((c) => c.type === "other");

  if (jsChunks.length > 0) {
    console.log("\n🟨 JavaScript Chunks:");
    jsChunks.forEach((chunk) => {
      const sizeStr = formatSize(chunk.size).padStart(10);
      console.log(`  ${sizeStr} - ${chunk.name}`);
    });
  }

  if (cssChunks.length > 0) {
    console.log("\n🟦 CSS Chunks:");
    cssChunks.forEach((chunk) => {
      const sizeStr = formatSize(chunk.size).padStart(10);
      console.log(`  ${sizeStr} - ${chunk.name}`);
    });
  }

  if (otherChunks.length > 0) {
    console.log("\n🟪 Other Assets:");
    otherChunks.forEach((chunk) => {
      const sizeStr = formatSize(chunk.size).padStart(10);
      console.log(`  ${sizeStr} - ${chunk.name}`);
    });
  }

  console.log("\n💡 Recommendations:");
  console.log("-------------------");
  analysis.recommendations.forEach((rec) => {
    console.log(`  ${rec}`);
  });

  console.log("\n");
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analysis = analyzeBuild();
  printBuildAnalysis(analysis);
}
