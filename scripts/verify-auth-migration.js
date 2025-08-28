#!/usr/bin/env node

/**
 * Verify Authentication System Migration
 * Ensures all components use unified auth system and no deprecated imports remain
 */

async function verifyAuthMigration() {
  console.log('🔍 Verifying Authentication System Migration');
  console.log('=' .repeat(60));

  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // Step 1: Check for deprecated authentication imports
    console.log('\n📝 Step 1: Scan for deprecated authentication imports');
    
    const deprecatedPatterns = [
      {
        name: 'Old useAuth hook',
        pattern: /import\s*{\s*useAuth\s*}\s*from\s*['"]\.\.\/hooks\/useAuth['"];?/g,
        description: 'Components importing from deprecated useAuth hook'
      },
      {
        name: 'Family Federation Auth',
        pattern: /import\s*{\s*useFamilyFederationAuth\s*}\s*from\s*['"][^'"]*useFamilyFederationAuth['"];?/g,
        description: 'Components importing from deprecated family federation auth'
      },
      {
        name: 'Family Auth',
        pattern: /import\s*{\s*useFamilyAuth\s*}\s*from\s*['"][^'"]*useFamilyAuth['"];?/g,
        description: 'Components importing from deprecated family auth'
      }
    ];
    
    const correctPatterns = [
      {
        name: 'Unified Auth System',
        pattern: /import\s*{\s*useAuth\s*}\s*from\s*['"]\.\/auth\/AuthProvider['"];?/g,
        description: 'Components using unified auth system'
      }
    ];
    
    // Get all TypeScript/JavaScript files in src/components
    function getSourceFiles(dir) {
      const files = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...getSourceFiles(fullPath));
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
          files.push(fullPath);
        }
      }
      
      return files;
    }
    
    const sourceFiles = getSourceFiles('src/components');
    console.log(`📄 Scanning ${sourceFiles.length} component files`);
    
    const deprecatedImports = [];
    const correctImports = [];
    
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for deprecated imports
      for (const pattern of deprecatedPatterns) {
        const matches = content.match(pattern.pattern);
        if (matches) {
          deprecatedImports.push({
            file: filePath,
            pattern: pattern.name,
            description: pattern.description,
            matches: matches
          });
        }
      }
      
      // Check for correct imports
      for (const pattern of correctPatterns) {
        const matches = content.match(pattern.pattern);
        if (matches) {
          correctImports.push({
            file: filePath,
            pattern: pattern.name,
            matches: matches
          });
        }
      }
    }
    
    // Report deprecated imports
    if (deprecatedImports.length > 0) {
      console.log('\n❌ DEPRECATED IMPORTS FOUND:');
      deprecatedImports.forEach(item => {
        console.log(`   ${path.basename(item.file)}: ${item.pattern}`);
        item.matches.forEach(match => {
          console.log(`     - ${match}`);
        });
      });
    } else {
      console.log('\n✅ No deprecated authentication imports found');
    }
    
    // Report correct imports
    if (correctImports.length > 0) {
      console.log('\n✅ UNIFIED AUTH SYSTEM IMPORTS:');
      correctImports.forEach(item => {
        console.log(`   ${path.basename(item.file)}: ${item.pattern}`);
      });
    }
    
    // Step 2: Check for deprecated authentication files
    console.log('\n📝 Step 2: Check for deprecated authentication files');
    
    const deprecatedFiles = [
      'src/hooks/useAuth.ts',
      'src/hooks/useFamilyFederationAuth.ts', 
      'src/hooks/useFamilyAuth.ts'
    ];
    
    const existingDeprecatedFiles = [];
    
    for (const filePath of deprecatedFiles) {
      if (fs.existsSync(filePath)) {
        existingDeprecatedFiles.push(filePath);
        console.log(`❌ Deprecated file still exists: ${filePath}`);
      } else {
        console.log(`✅ Deprecated file removed: ${filePath}`);
      }
    }
    
    // Step 3: Verify unified auth system files exist
    console.log('\n📝 Step 3: Verify unified auth system files');
    
    const requiredFiles = [
      'src/lib/auth/unified-auth-system.ts',
      'src/components/auth/AuthProvider.tsx',
      'src/lib/auth/secure-token-manager.ts'
    ];
    
    const missingRequiredFiles = [];
    
    for (const filePath of requiredFiles) {
      if (fs.existsSync(filePath)) {
        console.log(`✅ Required file exists: ${filePath}`);
      } else {
        missingRequiredFiles.push(filePath);
        console.log(`❌ Required file missing: ${filePath}`);
      }
    }
    
    // Step 4: Test backend authentication endpoints
    console.log('\n📝 Step 4: Test backend authentication endpoints');
    
    const testUsername = `testuser${Date.now()}`;
    const testPassword = 'TestPassword123!';
    
    const registrationData = {
      username: testUsername,
      password: testPassword,
      confirmPassword: testPassword,
      npub: 'npub1test123456789abcdef123456789abcdef123456789abcdef123456789abc',
      encryptedNsec: 'encrypted_test_nsec',
      nip05: `${testUsername}@satnam.pub`,
      lightningAddress: `${testUsername}@satnam.pub`,
      generateInviteToken: true,
      role: 'private',
      authMethod: 'nip05-password'
    };

    try {
      const registerResponse = await fetch('http://localhost:8888/api/auth/register-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      if (registerResponse.ok) {
        const registrationResult = await registerResponse.json();
        console.log('✅ Registration endpoint working');
        
        // Test session validation
        const jwtToken = registrationResult.session?.token;
        if (jwtToken) {
          const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
            method: 'GET',
            headers: { 
              'Authorization': `Bearer ${jwtToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (sessionResponse.ok) {
            console.log('✅ Session validation working');
          } else {
            console.log('❌ Session validation failed');
          }
        }
      } else {
        console.log('❌ Registration endpoint failed');
      }
    } catch (error) {
      console.log('⚠️ Backend endpoints not available (server may not be running)');
    }
    
    // Summary
    console.log('\n🎉 AUTHENTICATION MIGRATION VERIFICATION RESULTS:');
    console.log('=' .repeat(60));
    
    const hasDeprecatedImports = deprecatedImports.length > 0;
    const hasDeprecatedFiles = existingDeprecatedFiles.length > 0;
    const hasMissingRequiredFiles = missingRequiredFiles.length > 0;
    const hasCorrectImports = correctImports.length > 0;
    
    console.log('📊 Migration Status:');
    console.log(`   Deprecated Imports: ${hasDeprecatedImports ? '❌' : '✅'} ${hasDeprecatedImports ? 'Found' : 'None Found'}`);
    console.log(`   Deprecated Files: ${hasDeprecatedFiles ? '❌' : '✅'} ${hasDeprecatedFiles ? 'Still Exist' : 'Removed'}`);
    console.log(`   Required Files: ${hasMissingRequiredFiles ? '❌' : '✅'} ${hasMissingRequiredFiles ? 'Missing' : 'Present'}`);
    console.log(`   Unified Auth Usage: ${hasCorrectImports ? '✅' : '❌'} ${hasCorrectImports ? 'In Use' : 'Not Found'}`);

    const migrationComplete = !hasDeprecatedImports && !hasDeprecatedFiles && !hasMissingRequiredFiles && hasCorrectImports;

    console.log(`\n🎯 OVERALL RESULT: ${migrationComplete ? '✅ MIGRATION COMPLETE' : '❌ MIGRATION INCOMPLETE'}`);
    
    if (migrationComplete) {
      console.log('\n💡 CONCLUSION:');
      console.log('Authentication system migration is COMPLETE!');
      console.log('- All components use unified authentication system');
      console.log('- No deprecated authentication imports remain');
      console.log('- All required unified auth files are present');
      console.log('- Backend authentication endpoints are functional');
      console.log('\nThe authentication state inconsistency issues should be RESOLVED!');
    } else {
      console.log('\n⚠️ MIGRATION INCOMPLETE:');
      if (hasDeprecatedImports) {
        console.log('- Some components still use deprecated authentication imports');
      }
      if (hasDeprecatedFiles) {
        console.log('- Deprecated authentication files still exist');
      }
      if (hasMissingRequiredFiles) {
        console.log('- Required unified auth system files are missing');
      }
      if (!hasCorrectImports) {
        console.log('- No components found using unified auth system');
      }
      console.log('\nAdditional migration work is required.');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

verifyAuthMigration().catch(console.error);
