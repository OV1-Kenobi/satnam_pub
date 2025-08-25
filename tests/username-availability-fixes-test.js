/**
 * Username Availability API Fixes Test Suite
 * 
 * Tests the critical fixes for:
 * 1. HTTP method support (GET and POST)
 * 2. Request parsing for both methods
 * 3. Persistent rate limiting using Supabase
 */

const fetch = require('node-fetch');

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:8888',
  endpoint: '/api/auth/check-username-availability',
  testUsername: 'testuser123',
  rateLimitTestCount: 12 // Exceeds the 10 request limit
};

/**
 * Test GET method support
 */
async function testGETMethod() {
  console.log('\n🔍 Testing GET Method Support');
  
  try {
    const url = `${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}?username=${TEST_CONFIG.testUsername}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    const statusOk = response.status === 200;
    const hasData = data.success !== undefined && data.available !== undefined;

    console.log(`  ✅ Status Code: ${response.status} ${statusOk ? '(SUCCESS)' : '(FAILED)'}`);
    console.log(`  ✅ Response Data: ${hasData ? 'Valid structure' : 'Invalid structure'}`);
    console.log(`  📋 Response: ${JSON.stringify(data, null, 2)}`);

    return statusOk && hasData;
  } catch (error) {
    console.error(`  ❌ GET Method Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test POST method support (existing functionality)
 */
async function testPOSTMethod() {
  console.log('\n📤 Testing POST Method Support');
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: TEST_CONFIG.testUsername
      })
    });

    const data = await response.json();
    const statusOk = response.status === 200;
    const hasData = data.success !== undefined && data.available !== undefined;

    console.log(`  ✅ Status Code: ${response.status} ${statusOk ? '(SUCCESS)' : '(FAILED)'}`);
    console.log(`  ✅ Response Data: ${hasData ? 'Valid structure' : 'Invalid structure'}`);
    console.log(`  📋 Response: ${JSON.stringify(data, null, 2)}`);

    return statusOk && hasData;
  } catch (error) {
    console.error(`  ❌ POST Method Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test unsupported method rejection
 */
async function testUnsupportedMethod() {
  console.log('\n🚫 Testing Unsupported Method Rejection');
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: TEST_CONFIG.testUsername
      })
    });

    const data = await response.json();
    const statusOk = response.status === 405;
    const hasError = data.success === false && data.error === 'Method not allowed';

    console.log(`  ✅ Status Code: ${response.status} ${statusOk ? '(CORRECT 405)' : '(WRONG STATUS)'}`);
    console.log(`  ✅ Error Message: ${hasError ? 'Correct error' : 'Wrong error'}`);

    return statusOk && hasError;
  } catch (error) {
    console.error(`  ❌ Unsupported Method Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test rate limiting functionality
 */
async function testRateLimiting() {
  console.log('\n⏱️ Testing Persistent Rate Limiting');
  
  try {
    let successCount = 0;
    let rateLimitedCount = 0;
    
    console.log(`  📊 Sending ${TEST_CONFIG.rateLimitTestCount} requests to test rate limiting...`);
    
    // Send multiple requests rapidly to trigger rate limiting
    const promises = [];
    for (let i = 0; i < TEST_CONFIG.rateLimitTestCount; i++) {
      promises.push(
        fetch(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: `ratetest${i}`
          })
        })
      );
    }

    const responses = await Promise.all(promises);
    
    for (const response of responses) {
      if (response.status === 200) {
        successCount++;
      } else if (response.status === 429) {
        rateLimitedCount++;
      }
    }

    console.log(`  ✅ Successful Requests: ${successCount}`);
    console.log(`  ⚠️ Rate Limited Requests: ${rateLimitedCount}`);
    
    // Rate limiting should kick in after 10 requests
    const rateLimitingWorking = rateLimitedCount > 0;
    console.log(`  ${rateLimitingWorking ? '✅' : '❌'} Rate Limiting: ${rateLimitingWorking ? 'WORKING' : 'NOT WORKING'}`);

    return rateLimitingWorking;
  } catch (error) {
    console.error(`  ❌ Rate Limiting Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test CORS headers
 */
async function testCORSHeaders() {
  console.log('\n🌐 Testing CORS Headers');
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    const corsHeaders = {
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
    };

    console.log('  📋 CORS Headers:');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      const present = value !== null;
      console.log(`    ${present ? '✅' : '❌'} ${key}: ${value || 'MISSING'}`);
    });

    const statusOk = response.status === 200;
    const allHeadersPresent = Object.values(corsHeaders).every(v => v !== null);

    return statusOk && allHeadersPresent;
  } catch (error) {
    console.error(`  ❌ CORS Headers Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test input validation
 */
async function testInputValidation() {
  console.log('\n🔍 Testing Input Validation');
  
  const testCases = [
    { username: '', expectedError: true, description: 'Empty username' },
    { username: 'ab', expectedError: true, description: 'Too short username' },
    { username: 'a'.repeat(25), expectedError: true, description: 'Too long username' },
    { username: 'test@user', expectedError: true, description: 'Invalid characters' },
    { username: 'validuser123', expectedError: false, description: 'Valid username' }
  ];

  let passedTests = 0;

  for (const testCase of testCases) {
    try {
      const response = await fetch(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: testCase.username
        })
      });

      const data = await response.json();
      const hasError = data.error !== undefined;
      const testPassed = testCase.expectedError ? hasError : !hasError;

      console.log(`    ${testPassed ? '✅' : '❌'} ${testCase.description}: ${testPassed ? 'PASSED' : 'FAILED'}`);
      
      if (testPassed) passedTests++;
    } catch (error) {
      console.error(`    ❌ ${testCase.description}: ERROR - ${error.message}`);
    }
  }

  return passedTests === testCases.length;
}

/**
 * Run comprehensive test suite
 */
async function runTestSuite() {
  console.log('🧪 Username Availability API Fixes Test Suite');
  console.log('=' .repeat(60));
  console.log(`Base URL: ${TEST_CONFIG.baseUrl}`);
  console.log(`Endpoint: ${TEST_CONFIG.endpoint}`);
  
  const results = {
    getMethodPassed: false,
    postMethodPassed: false,
    unsupportedMethodPassed: false,
    rateLimitingPassed: false,
    corsHeadersPassed: false,
    inputValidationPassed: false
  };

  // Run all tests
  results.getMethodPassed = await testGETMethod();
  results.postMethodPassed = await testPOSTMethod();
  results.unsupportedMethodPassed = await testUnsupportedMethod();
  results.rateLimitingPassed = await testRateLimiting();
  results.corsHeadersPassed = await testCORSHeaders();
  results.inputValidationPassed = await testInputValidation();

  // Summary
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  console.log(`GET Method Support: ${results.getMethodPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`POST Method Support: ${results.postMethodPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Unsupported Method Rejection: ${results.unsupportedMethodPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Persistent Rate Limiting: ${results.rateLimitingPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`CORS Headers: ${results.corsHeadersPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Input Validation: ${results.inputValidationPassed ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allTestsPassed = Object.values(results).every(result => result === true);
  
  console.log(`\n${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (!allTestsPassed) {
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('- Ensure Netlify Dev is running: netlify dev');
    console.log('- Check database migration 015 has been applied');
    console.log('- Verify DUID_SERVER_SECRET environment variable is set');
    console.log('- Check Supabase connection and rate_limits table exists');
  }

  return allTestsPassed;
}

// Run tests if called directly
if (require.main === module) {
  runTestSuite().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { 
  runTestSuite, 
  testGETMethod, 
  testPOSTMethod, 
  testRateLimiting,
  testInputValidation 
};
