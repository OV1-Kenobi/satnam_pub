#!/usr/bin/env node

/**
 * Batch Authentication Migration Script
 * Updates remaining components to use unified auth system
 */

async function batchAuthMigration() {
  console.log('🔄 Running Batch Authentication Migration');
  console.log('=' .repeat(60));

  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // Components that still need migration (from verification test)
    const componentsToMigrate = [
      {
        file: 'src/components/auth/FamilyFederationSignIn.tsx',
        oldImport: "import { useFamilyFederationAuth } from '../../hooks/useFamilyFederationAuth';",
        newImport: "import { useAuth } from './AuthProvider'; // FIXED: Use unified auth system"
      },
      {
        file: 'src/components/EmergencyRecoveryPage.tsx',
        oldImport: "import { useAuth } from '../hooks/useAuth';",
        newImport: "import { useAuth } from './auth/AuthProvider'; // FIXED: Use unified auth system"
      },
      {
        file: 'src/components/examples/FamilyDashboardExample.tsx',
        oldImport: "import { useFamilyFederationAuth } from '../../hooks/useFamilyFederationAuth';",
        newImport: "import { useAuth } from '../auth/AuthProvider'; // FIXED: Use unified auth system"
      },
      {
        file: 'src/components/FamilyDashboard.tsx',
        oldImport: 'import { useAuth } from "../hooks/useAuth";',
        newImport: 'import { useAuth } from "./auth/AuthProvider"; // FIXED: Use unified auth system'
      },
      {
        file: 'src/components/NostrEcosystem.tsx',
        oldImport: 'import { useAuth } from "../hooks/useAuth";',
        newImport: 'import { useAuth } from "./auth/AuthProvider"; // FIXED: Use unified auth system'
      },
      {
        file: 'src/components/NWCWalletSetupModal.tsx',
        oldImport: "import { useAuth } from '../hooks/useAuth';",
        newImport: "import { useAuth } from './auth/AuthProvider'; // FIXED: Use unified auth system"
      },
      {
        file: 'src/components/SovereigntyEducationFlow.tsx',
        oldImport: "import { useAuth } from '../hooks/useAuth';",
        newImport: "import { useAuth } from './auth/AuthProvider'; // FIXED: Use unified auth system"
      }
    ];

    console.log(`📝 Migrating ${componentsToMigrate.length} components to unified auth system`);

    let successCount = 0;
    let errorCount = 0;

    for (const component of componentsToMigrate) {
      try {
        console.log(`\n🔄 Processing: ${path.basename(component.file)}`);
        
        // Check if file exists
        if (!fs.existsSync(component.file)) {
          console.log(`⚠️  File not found: ${component.file}`);
          continue;
        }

        // Read file content
        let content = fs.readFileSync(component.file, 'utf8');
        
        // Check if old import exists
        if (!content.includes(component.oldImport)) {
          console.log(`⚠️  Old import not found in ${path.basename(component.file)}`);
          console.log(`   Looking for: ${component.oldImport}`);
          
          // Try to find similar imports
          const lines = content.split('\n');
          const importLines = lines.filter(line => 
            line.includes('useAuth') || line.includes('useFamilyFederationAuth')
          );
          
          if (importLines.length > 0) {
            console.log(`   Found similar imports:`);
            importLines.forEach(line => console.log(`     ${line.trim()}`));
          }
          continue;
        }

        // Check if new import already exists
        if (content.includes(component.newImport) || content.includes("import { useAuth } from './AuthProvider'")) {
          console.log(`✅ Already migrated: ${path.basename(component.file)}`);
          successCount++;
          continue;
        }

        // Perform replacement
        const updatedContent = content.replace(component.oldImport, component.newImport);
        
        if (updatedContent === content) {
          console.log(`❌ No changes made to ${path.basename(component.file)}`);
          errorCount++;
          continue;
        }

        // Write updated content
        fs.writeFileSync(component.file, updatedContent, 'utf8');
        console.log(`✅ Successfully migrated: ${path.basename(component.file)}`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating ${path.basename(component.file)}:`, error.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n🎉 BATCH MIGRATION RESULTS:');
    console.log('=' .repeat(60));
    console.log(`📊 Migration Summary:`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Total: ${componentsToMigrate.length}`);

    if (successCount === componentsToMigrate.length) {
      console.log('\n✅ ALL COMPONENTS SUCCESSFULLY MIGRATED!');
      console.log('Running verification test to confirm...');
      
      // Run verification test
      const { spawn } = await import('child_process');
      const verifyProcess = spawn('node', ['scripts/verify-auth-migration.js'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      verifyProcess.on('close', (code) => {
        if (code === 0) {
          console.log('\n🎯 MIGRATION VERIFICATION: SUCCESS!');
        } else {
          console.log('\n⚠️ MIGRATION VERIFICATION: Some issues remain');
        }
      });
      
    } else {
      console.log('\n⚠️ MIGRATION INCOMPLETE');
      console.log('Some components could not be migrated automatically.');
      console.log('Manual intervention may be required.');
    }

  } catch (error) {
    console.error('❌ Batch migration failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

batchAuthMigration().catch(console.error);
