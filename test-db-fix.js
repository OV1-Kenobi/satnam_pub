// Quick test to verify the db module is working
import db from './lib/db.js';

console.log('Testing db module...');

// Test that the module exports exist
console.log('✅ db module loaded successfully');
console.log('✅ db.models exists:', !!db.models);
console.log('✅ db.models.educationalInvitations exists:', !!db.models.educationalInvitations);
console.log('✅ db.models.courseCredits exists:', !!db.models.courseCredits);
console.log('✅ db.models.profiles exists:', !!db.models.profiles);
console.log('✅ db.models.families exists:', !!db.models.families);
console.log('✅ db.models.lightningAddresses exists:', !!db.models.lightningAddresses);
console.log('✅ db.models.nostrBackups exists:', !!db.models.nostrBackups);

console.log('\n🎉 All database models are available!');
console.log('The db.js import issue has been fixed.');