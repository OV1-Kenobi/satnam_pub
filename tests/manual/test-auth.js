#!/usr/bin/env node

/**
 * Test authentication system end-to-end
 */

async function testAuthentication() {
  const testCredentials = {
    nip05: 'testing1383@satnam.pub',
    password: 'password123'
  };
  
  console.log('🔐 Testing authentication system...');
  console.log('NIP-05:', testCredentials.nip05);
  console.log('Password:', testCredentials.password);
  console.log('');
  
  try {
    // Test the signin endpoint
    const response = await fetch('http://localhost:8888/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nip05: testCredentials.nip05,
        password: testCredentials.password
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Authentication successful!');
      console.log('Response data:', JSON.stringify(data, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Authentication failed');
      console.log('Error response:', errorText);
      
      // Try to parse as JSON if possible
      try {
        const errorData = JSON.parse(errorText);
        console.log('Parsed error:', JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.log('Raw error text:', errorText);
      }
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

// Run the test
testAuthentication().catch(console.error);
