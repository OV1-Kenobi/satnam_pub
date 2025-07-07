/**
 * Test script for NIP-05 endpoint
 * Run with: node test-nip05-endpoint.js
 */

async function testNIP05Endpoint() {
  const baseUrl = 'http://localhost:8888'; // Netlify dev server
  
  console.log('🧪 Testing NIP-05 Endpoint...\n');
  
  try {
    // Test 1: Get all NIP-05 records
    console.log('1️⃣ Testing GET /.well-known/nostr.json (all records)');
    const allRecordsResponse = await fetch(`${baseUrl}/.well-known/nostr.json`);
    const allRecords = await allRecordsResponse.json();
    console.log('✅ Response:', JSON.stringify(allRecords, null, 2));
    console.log('✅ Status:', allRecordsResponse.status);
    console.log('');
    
    // Test 2: Get specific user (if any exist)
    if (allRecords.names && Object.keys(allRecords.names).length > 0) {
      const firstUsername = Object.keys(allRecords.names)[0];
      console.log(`2️⃣ Testing GET /.well-known/nostr.json?name=${firstUsername}`);
      const specificUserResponse = await fetch(`${baseUrl}/.well-known/nostr.json?name=${firstUsername}`);
      const specificUser = await specificUserResponse.json();
      console.log('✅ Response:', JSON.stringify(specificUser, null, 2));
      console.log('✅ Status:', specificUserResponse.status);
      console.log('');
    }
    
    // Test 3: Test non-existent user
    console.log('3️⃣ Testing GET /.well-known/nostr.json?name=nonexistent');
    const nonExistentResponse = await fetch(`${baseUrl}/.well-known/nostr.json?name=nonexistent`);
    const nonExistent = await nonExistentResponse.json();
    console.log('✅ Response:', JSON.stringify(nonExistent, null, 2));
    console.log('✅ Status:', nonExistentResponse.status);
    console.log('');
    
    // Test 4: Test CORS headers
    console.log('4️⃣ Testing CORS headers');
    const corsResponse = await fetch(`${baseUrl}/.well-known/nostr.json`, {
      method: 'OPTIONS'
    });
    console.log('✅ CORS Headers:');
    console.log('   Access-Control-Allow-Origin:', corsResponse.headers.get('Access-Control-Allow-Origin'));
    console.log('   Access-Control-Allow-Methods:', corsResponse.headers.get('Access-Control-Allow-Methods'));
    console.log('   Access-Control-Allow-Headers:', corsResponse.headers.get('Access-Control-Allow-Headers'));
    console.log('');
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure your Netlify dev server is running:');
    console.log('   npm run dev');
  }
}

// Run the test
testNIP05Endpoint(); 