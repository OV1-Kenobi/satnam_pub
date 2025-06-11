const fs = require('fs');
const path = require('path');
const protectedFiles = [
  'src/components/EducationPlatform.tsx',
  'src/components/FamilyCoordination.tsx', 
  'src/components/FamilyDashboard.tsx',
  'src/components/FamilyOnboarding.tsx',
  'src/components/IdentityForge.tsx',
  'src/components/NostrEcosystem.tsx',
  'src/components/SignInModal.tsx'
];
console.log('🔒 Verifying frontend protection...');
protectedFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    console.log(`✅ ${file} - ${Math.round(stats.size/1024)}KB`);
  } else {
    console.log(`❌ MISSING: ${file}`);
  }
});
console.log('🔒 Frontend verification complete');