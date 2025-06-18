"use strict";
/**
 * TypeScript 'any' Type Fixer Script
 *
 * Scans the codebase for 'any' types and provides automated fixes
 * following the DEVELOPMENT_PROTOCOLS.md standards
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptAnyFixer = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
// Common type replacements based on context
const TYPE_SUGGESTIONS = [
    {
        pattern: /function\s+\w+\s*\([^)]*\)\s*:\s*any/g,
        replacement: "function $1(): Promise<void> | void",
        description: "Function return type should be explicit",
    },
    {
        pattern: /\(\s*\w+\s*:\s*any\s*\)/g,
        replacement: "($1: unknown)",
        description: "Use 'unknown' instead of 'any' for safer typing",
    },
    {
        pattern: /:\s*any\[\]/g,
        replacement: ": unknown[]",
        description: "Use 'unknown[]' instead of 'any[]'",
    },
    {
        pattern: /as\s+any/g,
        replacement: "as unknown",
        description: "Use 'unknown' type assertion instead of 'any'",
    },
    {
        pattern: /Promise<any>/g,
        replacement: "Promise<unknown>",
        description: "Use Promise<unknown> instead of Promise<any>",
    },
    {
        pattern: /Record<string,\s*any>/g,
        replacement: "Record<string, unknown>",
        description: "Use Record<string, unknown> instead of Record<string, any>",
    },
];
// Context-specific type suggestions
const CONTEXT_TYPES = {
    config: "Config",
    request: "Request",
    response: "Response",
    error: "Error",
    event: "Event | NostrEvent",
    user: "User",
    family: "FamilyMember",
    payment: "PaymentRequest | PaymentResponse",
    invoice: "string",
    amount: "number",
    balance: "number",
    data: "unknown",
    params: "Record<string, string>",
    query: "URLSearchParams",
    body: "unknown",
    headers: "Headers",
    options: "Record<string, unknown>",
};
class TypeScriptAnyFixer {
    constructor() {
        this.issues = [];
        this.fixedCount = 0;
        this.totalFiles = 0;
    }
    /**
     * Scan directory for TypeScript files
     */
    scanDirectory(dir) {
        const files = [];
        try {
            const items = (0, fs_1.readdirSync)(dir);
            for (const item of items) {
                const fullPath = (0, path_1.join)(dir, item);
                const stat = (0, fs_1.statSync)(fullPath);
                if (stat.isDirectory()) {
                    // Skip node_modules and .git directories
                    if (!["node_modules", ".git", ".next", "dist", "build"].includes(item)) {
                        files.push(...this.scanDirectory(fullPath));
                    }
                }
                else if (item.endsWith(".ts") || item.endsWith(".tsx")) {
                    files.push(fullPath);
                }
            }
        }
        catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
        }
        return files;
    }
    /**
     * Analyze file for 'any' type usage
     */
    analyzeFile(filePath) {
        const issues = [];
        try {
            const content = (0, fs_1.readFileSync)(filePath, "utf-8");
            const lines = content.split("\n");
            lines.forEach((line, index) => {
                const anyMatches = line.matchAll(/\bany\b/g);
                for (const match of anyMatches) {
                    if (match.index !== undefined) {
                        // Skip comments and strings
                        const beforeMatch = line.substring(0, match.index);
                        if (beforeMatch.includes("//") ||
                            beforeMatch.includes("/*") ||
                            beforeMatch.split('"').length % 2 === 0 ||
                            beforeMatch.split("'").length % 2 === 0) {
                            continue;
                        }
                        const context = line.trim();
                        const suggestedFix = this.generateSuggestedFix(context, line);
                        issues.push({
                            file: filePath,
                            line: index + 1,
                            column: match.index + 1,
                            context,
                            suggestedFix,
                            severity: this.determineSeverity(context),
                        });
                    }
                }
            });
        }
        catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
        }
        return issues;
    }
    /**
     * Generate suggested fix for 'any' type usage
     */
    generateSuggestedFix(context, fullLine) {
        // Check for common patterns
        for (const suggestion of TYPE_SUGGESTIONS) {
            if (suggestion.pattern.test(context)) {
                return fullLine.replace(/\bany\b/g, suggestion.replacement);
            }
        }
        // Check for context-specific types
        for (const [keyword, type] of Object.entries(CONTEXT_TYPES)) {
            if (context.toLowerCase().includes(keyword)) {
                return fullLine.replace(/\bany\b/g, type);
            }
        }
        // Function parameters
        if (context.includes("(") &&
            context.includes(":") &&
            context.includes("any")) {
            return fullLine.replace(/:\s*any/g, ": unknown");
        }
        // Function return types
        if (context.includes("function") || context.includes("=>")) {
            return fullLine.replace(/:\s*any/g, ": Promise<void> | void");
        }
        // Array types
        if (context.includes("[]")) {
            return fullLine.replace(/any\[\]/g, "unknown[]");
        }
        // Object types
        if (context.includes("{") || context.includes("Record")) {
            return fullLine.replace(/\bany\b/g, "unknown");
        }
        // Default suggestion
        return fullLine.replace(/\bany\b/g, "unknown");
    }
    /**
     * Determine severity of 'any' usage
     */
    determineSeverity(context) {
        // Function parameters and return types are errors
        if (context.includes("function") ||
            context.includes("=>") ||
            (context.includes("(") && context.includes(":"))) {
            return "error";
        }
        // Type assertions are warnings
        if (context.includes("as any")) {
            return "warning";
        }
        // Everything else is an error by default (zero tolerance policy)
        return "error";
    }
    /**
     * Apply automated fixes to a file
     */
    applyFixes(filePath, issues) {
        try {
            let content = (0, fs_1.readFileSync)(filePath, "utf-8");
            let modified = false;
            // Sort issues by line number (descending) to avoid index shifting
            const sortedIssues = issues.sort((a, b) => b.line - a.line);
            for (const issue of sortedIssues) {
                const lines = content.split("\n");
                const originalLine = lines[issue.line - 1];
                // Apply the suggested fix
                lines[issue.line - 1] = issue.suggestedFix;
                content = lines.join("\n");
                modified = true;
                console.log(`Fixed: ${filePath}:${issue.line}`);
                console.log(`  Before: ${originalLine.trim()}`);
                console.log(`  After:  ${issue.suggestedFix.trim()}`);
                this.fixedCount++;
            }
            if (modified) {
                (0, fs_1.writeFileSync)(filePath, content, "utf-8");
                return true;
            }
        }
        catch (error) {
            console.error(`Error applying fixes to ${filePath}:`, error);
        }
        return false;
    }
    /**
     * Generate report of all issues
     */
    generateReport() {
        console.log('\n=== TypeScript "any" Type Analysis Report ===');
        console.log(`Total files scanned: ${this.totalFiles}`);
        console.log(`Total "any" issues found: ${this.issues.length}`);
        console.log(`Fixes applied: ${this.fixedCount}`);
        // Group by severity
        const errors = this.issues.filter((i) => i.severity === "error");
        const warnings = this.issues.filter((i) => i.severity === "warning");
        console.log(`\nBreakdown:`);
        console.log(`  Errors: ${errors.length}`);
        console.log(`  Warnings: ${warnings.length}`);
        // Top problematic files
        const fileIssueCount = new Map();
        this.issues.forEach((issue) => {
            const count = fileIssueCount.get(issue.file) || 0;
            fileIssueCount.set(issue.file, count + 1);
        });
        const topFiles = Array.from(fileIssueCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        if (topFiles.length > 0) {
            console.log(`\nTop 10 files with most "any" issues:`);
            topFiles.forEach(([file, count], index) => {
                console.log(`  ${index + 1}. ${file}: ${count} issues`);
            });
        }
        // Remaining issues
        const remainingIssues = this.issues.length - this.fixedCount;
        if (remainingIssues > 0) {
            console.log(`\n⚠️  ${remainingIssues} issues require manual review`);
        }
        else {
            console.log(`\n✅ All "any" type issues have been addressed!`);
        }
    }
    /**
     * Main execution method
     */
    async run(projectRoot, autoFix = false) {
        console.log('🔍 Scanning for TypeScript "any" type issues...');
        console.log(`Project root: ${projectRoot}`);
        console.log(`Auto-fix enabled: ${autoFix}`);
        // Scan all TypeScript files
        const files = this.scanDirectory(projectRoot);
        this.totalFiles = files.length;
        console.log(`Found ${files.length} TypeScript files`);
        // Analyze each file
        for (const file of files) {
            const fileIssues = this.analyzeFile(file);
            this.issues.push(...fileIssues);
            // Apply fixes if auto-fix is enabled
            if (autoFix && fileIssues.length > 0) {
                this.applyFixes(file, fileIssues);
            }
        }
        // Generate report
        this.generateReport();
        // Exit with error code if issues remain
        const remainingIssues = this.issues.length - this.fixedCount;
        if (remainingIssues > 0) {
            console.log(`\n❌ ${remainingIssues} "any" type issues still need to be fixed`);
            console.log("Run with --auto-fix to apply automated fixes");
            process.exit(1);
        }
        else {
            console.log('\n✅ All "any" type issues have been resolved!');
        }
    }
}
exports.TypeScriptAnyFixer = TypeScriptAnyFixer;
// CLI execution
if (require.main === module) {
    const projectRoot = process.argv[3] || process.cwd();
    const autoFix = process.argv.includes("--auto-fix");
    const fixer = new TypeScriptAnyFixer();
    fixer.run(projectRoot, autoFix).catch((error) => {
        console.error("Error running TypeScript any fixer:", error);
        process.exit(1);
    });
}
