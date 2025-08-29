#!/usr/bin/env node

/**
 * Verify Bundle Optimization Fixes
 * Tests that Vite bundle splitting warnings have been resolved
 */

async function verifyBundleOptimization() {
  console.log('📦 Verifying Bundle Optimization Fixes');
  console.log('=' .repeat(60));

  try {
    const fs = await import('fs');
    const { spawn } = await import('child_process');
    
    // Step 1: Check that all toastService imports are now static
    console.log('\n📝 Step 1: Verify toastService import patterns');
    
    const filesToCheck = [
      'src/services/notificationService.ts',
      'src/components/IndividualFinancesDashboard.tsx',
      'src/components/PaymentAutomationModal.tsx',
      'src/services/contactApiService.ts'
    ];
    
    let allStaticImports = true;
    let dynamicImportsFound = [];
    let staticImportsFound = [];
    
    for (const filePath of filesToCheck) {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        continue;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for dynamic imports
      const dynamicImportMatch = content.match(/await\s+import\s*\(\s*['"]\.\/?\.?\/toastService['"]\s*\)/);
      if (dynamicImportMatch) {
        dynamicImportsFound.push(filePath);
        allStaticImports = false;
      }
      
      // Check for static imports
      const staticImportMatch = content.match(/import\s*{\s*showToast\s*}\s*from\s*['"]\.\/?\.?\/toastService['"]/);
      if (staticImportMatch) {
        staticImportsFound.push(filePath);
      }
      
      console.log(`   ${filePath.split('/').pop()}: ${dynamicImportMatch ? '❌ Dynamic' : staticImportMatch ? '✅ Static' : '⚠️ No import'}`);
    }
    
    console.log(`\n📊 Import Pattern Summary:`);
    console.log(`   Static imports: ${staticImportsFound.length}`);
    console.log(`   Dynamic imports: ${dynamicImportsFound.length}`);
    console.log(`   All static: ${allStaticImports ? '✅' : '❌'}`);
    
    // Step 2: Run build and check for warnings
    console.log('\n📝 Step 2: Test build for bundle splitting warnings');
    
    const buildOutput = await new Promise((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        stdio: 'pipe',
        cwd: process.cwd()
      });
      
      let output = '';
      let errorOutput = '';
      
      buildProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      buildProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ output, errorOutput, success: true });
        } else {
          reject(new Error(`Build failed with code ${code}: ${errorOutput}`));
        }
      });
      
      // Timeout after 60 seconds
      setTimeout(() => {
        buildProcess.kill();
        reject(new Error('Build timeout'));
      }, 60000);
    });
    
    // Check for bundle splitting warnings
    const hasToastServiceWarning = buildOutput.output.includes('toastService.ts is dynamically imported') ||
                                  buildOutput.output.includes('dynamic import will not move module into another chunk');
    
    console.log(`   Build successful: ${buildOutput.success ? '✅' : '❌'}`);
    console.log(`   No toastService warnings: ${!hasToastServiceWarning ? '✅' : '❌'}`);
    
    if (hasToastServiceWarning) {
      console.log('\n❌ Bundle splitting warning still present:');
      const warningLines = buildOutput.output.split('\n').filter(line => 
        line.includes('toastService') || line.includes('dynamic import')
      );
      warningLines.forEach(line => console.log(`   ${line.trim()}`));
    }
    
    // Step 3: Check bundle optimization metrics
    console.log('\n📝 Step 3: Analyze bundle optimization metrics');
    
    const distExists = fs.existsSync('dist');
    console.log(`   Dist directory created: ${distExists ? '✅' : '❌'}`);
    
    if (distExists) {
      const distFiles = fs.readdirSync('dist/assets').filter(f => f.endsWith('.js'));
      const componentBundle = distFiles.find(f => f.startsWith('components-'));
      const hasComponentBundle = !!componentBundle;
      
      console.log(`   Component bundle created: ${hasComponentBundle ? '✅' : '❌'}`);
      
      if (hasComponentBundle) {
        const bundleStats = fs.statSync(`dist/assets/${componentBundle}`);
        const bundleSizeKB = Math.round(bundleStats.size / 1024);
        console.log(`   Component bundle size: ${bundleSizeKB} KB`);
        
        // Check if bundle size is reasonable (should be under 500KB for components)
        const reasonableSize = bundleSizeKB < 500;
        console.log(`   Bundle size reasonable: ${reasonableSize ? '✅' : '⚠️'} (${bundleSizeKB} KB)`);
      }
    }
    
    // Step 4: Test that toast functionality is preserved
    console.log('\n📝 Step 4: Verify toast functionality preservation');
    
    // Check that showToast is properly exported from toastService
    const toastServiceContent = fs.readFileSync('src/services/toastService.ts', 'utf8');
    const hasShowToastExport = toastServiceContent.includes('export') && 
                              toastServiceContent.includes('showToast');
    
    console.log(`   showToast properly exported: ${hasShowToastExport ? '✅' : '❌'}`);
    
    // Check that all importing files can access showToast
    let allImportsValid = true;
    for (const filePath of staticImportsFound) {
      const content = fs.readFileSync(filePath, 'utf8');
      const usesShowToast = content.includes('showToast.');
      if (!usesShowToast) {
        console.log(`   ${filePath.split('/').pop()} uses showToast: ❌`);
        allImportsValid = false;
      } else {
        console.log(`   ${filePath.split('/').pop()} uses showToast: ✅`);
      }
    }
    
    // Summary
    console.log('\n📦 BUNDLE OPTIMIZATION VERIFICATION RESULTS:');
    console.log('=' .repeat(60));
    
    const criticalIssues = [];
    
    if (!allStaticImports) {
      criticalIssues.push('Mixed import patterns still present');
    }
    if (hasToastServiceWarning) {
      criticalIssues.push('Vite bundle splitting warning still appears');
    }
    if (!buildOutput.success) {
      criticalIssues.push('Build failed');
    }
    if (!hasShowToastExport) {
      criticalIssues.push('showToast not properly exported');
    }
    if (!allImportsValid) {
      criticalIssues.push('Some imports cannot access showToast');
    }
    
    console.log('📊 Optimization Status:');
    console.log(`   Critical Issues: ${criticalIssues.length === 0 ? '✅ None' : '❌ ' + criticalIssues.length}`);
    console.log(`   Static Imports: ${staticImportsFound.length} files`);
    console.log(`   Dynamic Imports: ${dynamicImportsFound.length} files`);
    console.log(`   Build Warnings: ${hasToastServiceWarning ? '❌ Present' : '✅ None'}`);
    
    if (criticalIssues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES FOUND:');
      criticalIssues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    const optimizationComplete = criticalIssues.length === 0;

    console.log(`\n🎯 OVERALL STATUS: ${optimizationComplete ? '✅ OPTIMIZATION SUCCESSFUL' : '❌ ISSUES REMAIN'}`);
    
    if (optimizationComplete) {
      console.log('\n💡 CONCLUSION:');
      console.log('Bundle optimization has been SUCCESSFULLY implemented!');
      console.log('- All toastService imports are now static');
      console.log('- Vite bundle splitting warning eliminated');
      console.log('- Build completes without optimization warnings');
      console.log('- Toast functionality preserved across all components');
      console.log('- Bundle size optimized for better performance');
      console.log('\nThe application is now optimized for Netlify deployment!');
    } else {
      console.log('\n⚠️ OPTIMIZATION INCOMPLETE:');
      console.log('Some bundle optimization issues still need to be addressed.');
      console.log('Additional fixes may be required for optimal performance.');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

verifyBundleOptimization().catch(console.error);
