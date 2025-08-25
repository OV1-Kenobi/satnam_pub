/**
 * Authentication Logout CORS and Cookie Deletion Test Suite
 * 
 * Tests the critical fixes for:
 * 1. Cookie deletion with proper Domain attribute matching
 * 2. CORS preflight response with correct headers and status
 * 3. Method Not Allowed response with CORS and Allow headers
 */

const fetch = require('node-fetch');

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:8888',
  endpoints: [
    '/api/auth/logout',
    '/api/auth/clear-refresh-cookie'
  ],
  domain: process.env.COOKIE_DOMAIN || undefined
};

/**
 * Test CORS Preflight Response (Issue 2 Fix)
 */
async function testCORSPreflight(endpoint) {
  console.log(`\n🔍 Testing CORS Preflight for ${endpoint}`);
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.satnam.pub',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });

    // Check status code (should be 204, not 200)
    const statusOk = response.status === 204;
    console.log(`  ✅ Status Code: ${response.status} ${statusOk ? '(FIXED)' : '(ISSUE)'}`);

    // Check CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
      'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials'),
      'Access-Control-Max-Age': response.headers.get('Access-Control-Max-Age')
    };

    console.log('  📋 CORS Headers:');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      const present = value !== null;
      console.log(`    ${present ? '✅' : '❌'} ${key}: ${value || 'MISSING'}`);
    });

    return statusOk && Object.values(corsHeaders).every(v => v !== null);
  } catch (error) {
    console.error(`  ❌ CORS Preflight Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Method Not Allowed Response (Issue 3 Fix)
 */
async function testMethodNotAllowed(endpoint) {
  console.log(`\n🚫 Testing Method Not Allowed for ${endpoint}`);
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Origin': 'https://www.satnam.pub'
      }
    });

    // Check status code
    const statusOk = response.status === 405;
    console.log(`  ✅ Status Code: ${response.status} ${statusOk ? '(CORRECT)' : '(ISSUE)'}`);

    // Check CORS headers (should be present even on 405)
    const corsHeaders = {
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials')
    };

    // Check Allow header
    const allowHeader = response.headers.get('Allow');
    const allowOk = allowHeader && allowHeader.includes('POST') && allowHeader.includes('OPTIONS');
    console.log(`  ${allowOk ? '✅' : '❌'} Allow Header: ${allowHeader || 'MISSING'}`);

    console.log('  📋 CORS Headers on 405:');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      const present = value !== null;
      console.log(`    ${present ? '✅' : '❌'} ${key}: ${value || 'MISSING'}`);
    });

    return statusOk && allowOk && Object.values(corsHeaders).every(v => v !== null);
  } catch (error) {
    console.error(`  ❌ Method Not Allowed Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Cookie Deletion Headers (Issue 1 Fix)
 */
async function testCookieDeletion(endpoint) {
  console.log(`\n🍪 Testing Cookie Deletion for ${endpoint}`);
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.satnam.pub'
      },
      body: JSON.stringify({})
    });

    // Check Set-Cookie headers
    const setCookieHeaders = response.headers.raw()['set-cookie'] || [];
    console.log(`  📋 Set-Cookie Headers (${setCookieHeaders.length} found):`);

    let cookieTestsPassed = 0;
    const expectedCookies = ['satnam_refresh_token', 'satnam_session_id'];

    expectedCookies.forEach(cookieName => {
      const cookieHeader = setCookieHeaders.find(header => header.startsWith(`${cookieName}=;`));
      
      if (cookieHeader) {
        console.log(`    ✅ ${cookieName}: ${cookieHeader}`);
        
        // Check for proper deletion attributes
        const hasMaxAge0 = cookieHeader.includes('Max-Age=0');
        const hasExpires = cookieHeader.includes('Expires=Thu, 01 Jan 1970');
        const hasPath = cookieHeader.includes('Path=/');
        const hasHttpOnly = cookieHeader.includes('HttpOnly');
        const hasSameSite = cookieHeader.includes('SameSite=Strict');
        
        // Check Domain attribute if configured
        const domainOk = !TEST_CONFIG.domain || cookieHeader.includes(`Domain=${TEST_CONFIG.domain}`);
        
        const allAttributesOk = hasMaxAge0 && hasExpires && hasPath && hasHttpOnly && hasSameSite && domainOk;
        
        console.log(`      ${hasMaxAge0 ? '✅' : '❌'} Max-Age=0`);
        console.log(`      ${hasExpires ? '✅' : '❌'} Expires (epoch)`);
        console.log(`      ${hasPath ? '✅' : '❌'} Path=/`);
        console.log(`      ${hasHttpOnly ? '✅' : '❌'} HttpOnly`);
        console.log(`      ${hasSameSite ? '✅' : '❌'} SameSite=Strict`);
        console.log(`      ${domainOk ? '✅' : '❌'} Domain (${TEST_CONFIG.domain || 'not configured'})`);
        
        if (allAttributesOk) cookieTestsPassed++;
      } else {
        console.log(`    ❌ ${cookieName}: MISSING`);
      }
    });

    return cookieTestsPassed === expectedCookies.length;
  } catch (error) {
    console.error(`  ❌ Cookie Deletion Test Failed: ${error.message}`);
    return false;
  }
}

/**
 * Run comprehensive test suite
 */
async function runTestSuite() {
  console.log('🧪 Authentication Logout CORS and Cookie Deletion Test Suite');
  console.log('=' .repeat(70));
  console.log(`Base URL: ${TEST_CONFIG.baseUrl}`);
  console.log(`Cookie Domain: ${TEST_CONFIG.domain || 'not configured'}`);
  
  const results = {
    corsPreflightPassed: 0,
    methodNotAllowedPassed: 0,
    cookieDeletionPassed: 0,
    totalEndpoints: TEST_CONFIG.endpoints.length
  };

  for (const endpoint of TEST_CONFIG.endpoints) {
    console.log(`\n📍 Testing endpoint: ${endpoint}`);
    console.log('-'.repeat(50));

    // Test CORS Preflight (Issue 2)
    if (await testCORSPreflight(endpoint)) {
      results.corsPreflightPassed++;
    }

    // Test Method Not Allowed (Issue 3)
    if (await testMethodNotAllowed(endpoint)) {
      results.methodNotAllowedPassed++;
    }

    // Test Cookie Deletion (Issue 1)
    if (await testCookieDeletion(endpoint)) {
      results.cookieDeletionPassed++;
    }
  }

  // Summary
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(70));
  console.log(`CORS Preflight Tests: ${results.corsPreflightPassed}/${results.totalEndpoints} passed`);
  console.log(`Method Not Allowed Tests: ${results.methodNotAllowedPassed}/${results.totalEndpoints} passed`);
  console.log(`Cookie Deletion Tests: ${results.cookieDeletionPassed}/${results.totalEndpoints} passed`);
  
  const allTestsPassed = 
    results.corsPreflightPassed === results.totalEndpoints &&
    results.methodNotAllowedPassed === results.totalEndpoints &&
    results.cookieDeletionPassed === results.totalEndpoints;
  
  console.log(`\n${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (!allTestsPassed) {
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('- Ensure Netlify Dev is running: netlify dev');
    console.log('- Check environment variables: COOKIE_DOMAIN, NODE_ENV');
    console.log('- Verify endpoints are accessible');
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

module.exports = { runTestSuite, testCORSPreflight, testMethodNotAllowed, testCookieDeletion };
