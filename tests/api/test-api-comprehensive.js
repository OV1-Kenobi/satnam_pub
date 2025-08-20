#!/usr/bin/env node

/**
 * Comprehensive API Testing Script
 * Tests all API endpoints with response times and data validation
 */

const API_BASE = "http://localhost:3000";

// Test results storage
const testResults = [];

// Helper function to make API requests with timing
async function testEndpoint(name, endpoint, options = {}) {
  const startTime = Date.now();
  
  try {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      ...options
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    let data = null;
    let error = null;
    
    try {
      data = await response.json();
    } catch (e) {
      error = `Failed to parse JSON: ${e.message}`;
    }

    const result = {
      name,
      endpoint,
      method: options.method || 'GET',
      status: response.status,
      success: response.ok,
      responseTime,
      data,
      error: error || (response.ok ? null : `HTTP ${response.status}: ${response.statusText}`),
      timestamp: new Date().toISOString()
    };

    testResults.push(result);
    return result;
    
  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    const result = {
      name,
      endpoint,
      method: options.method || 'GET',
      status: 0,
      success: false,
      responseTime,
      data: null,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    testResults.push(result);
    return result;
  }
}

// Test suite functions
async function testHealthEndpoints() {
  console.log('\n🏥 Testing Health Endpoints...');
  
  await testEndpoint('System Health', '/api/health');
  await testEndpoint('API Test', '/api/test');
  await testEndpoint('Health OPTIONS', '/api/health', { method: 'OPTIONS' });
}

async function testServiceStatus() {
  console.log('\n⚡ Testing Service Status Endpoints...');
  
  await testEndpoint('Lightning Status', '/api/lightning/status');
  await testEndpoint('PhoenixD Status', '/api/phoenixd/status');
  await testEndpoint('Fedimint Status', '/api/fedimint/status');
}

async function testFamilyEndpoints() {
  console.log('\n👨‍👩‍👧‍👦 Testing Family Endpoints...');
  
  await testEndpoint('Get Family Members', '/api/family/members');
  await testEndpoint('Get Specific Member', '/api/family/members?memberId=parent1');
  await testEndpoint('Family Treasury', '/api/family/treasury');
  
  // Test adding a family member
  await testEndpoint('Add Family Member', '/api/family/members', {
    method: 'POST',
    body: {
      name: 'Test Child',
      role: 'child'
    }
  });
}

async function testIndividualEndpoints() {
  console.log('\n👤 Testing Individual Endpoints...');
  
  await testEndpoint('Individual Wallet', '/api/individual/wallet?memberId=test-member');
  await testEndpoint('Lightning Wallet', '/api/individual/lightning/wallet?memberId=test-member');
  
  // Test lightning zap
  await testEndpoint('Lightning Zap', '/api/individual/lightning/zap', {
    method: 'POST',
    body: {
      memberId: 'test-member',
      amount: 1000,
      recipient: 'npub1test123',
      memo: 'Test zap payment'
    }
  });
}

async function testPaymentEndpoints() {
  console.log('\n💰 Testing Payment Endpoints...');
  
  await testEndpoint('Send Payment', '/api/payments/send', {
    method: 'POST',
    body: {
      memberId: 'parent1',
      amount: 5000,
      recipient: 'child1@satnam.family',
      memo: 'Weekly allowance'
    }
  });
}

async function testAtomicSwapEndpoints() {
  console.log('\n🔄 Testing Atomic Swap Endpoints...');
  
  await testEndpoint('Atomic Swap', '/api/bridge/atomic-swap', {
    method: 'POST',
    body: {
      fromContext: 'lightning',
      toContext: 'fedimint',
      fromMemberId: 'parent1',
      toMemberId: 'child1',
      amount: 50000
    }
  });
  
  await testEndpoint('Swap Status', '/api/bridge/swap-status?swapId=swap_123');
}

async function testErrorHandling() {
  console.log('\n❌ Testing Error Handling...');
  
  // Test invalid endpoints
  await testEndpoint('Invalid Endpoint', '/api/nonexistent');
  await testEndpoint('Invalid Method', '/api/health', { method: 'DELETE' });
  
  // Test invalid data
  await testEndpoint('Invalid Family Member', '/api/family/members', {
    method: 'POST',
    body: {
      // Missing required fields
      name: ''
    }
  });
  
  await testEndpoint('Invalid Zap', '/api/individual/lightning/zap', {
    method: 'POST',
    body: {
      // Invalid amount
      memberId: 'test',
      amount: -100,
      recipient: 'invalid'
    }
  });
}

async function testCORSHeaders() {
  console.log('\n🌐 Testing CORS Headers...');
  
  await testEndpoint('CORS Preflight', '/api/health', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  });
}

// Performance testing
async function testPerformance() {
  console.log('\n⚡ Testing Performance...');
  
  const concurrentTests = [];
  const testCount = 10;
  
  for (let i = 0; i < testCount; i++) {
    concurrentTests.push(testEndpoint(`Concurrent Health ${i + 1}`, '/api/health'));
  }
  
  const startTime = Date.now();
  await Promise.all(concurrentTests);
  const totalTime = Date.now() - startTime;
  
  console.log(`   ✅ Completed ${testCount} concurrent requests in ${totalTime}ms`);
  console.log(`   📊 Average response time: ${totalTime / testCount}ms`);
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Comprehensive API Tests...');
  console.log('=' .repeat(60));
  
  const overallStartTime = Date.now();
  
  try {
    await testHealthEndpoints();
    await testServiceStatus();
    await testFamilyEndpoints();
    await testIndividualEndpoints();
    await testPaymentEndpoints();
    await testAtomicSwapEndpoints();
    await testErrorHandling();
    await testCORSHeaders();
    await testPerformance();
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }
  
  const overallEndTime = Date.now();
  const totalTestTime = overallEndTime - overallStartTime;
  
  // Generate comprehensive report
  generateReport(totalTestTime);
}

function generateReport(totalTestTime) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE API TEST RESULTS');
  console.log('='.repeat(60));
  
  const successfulTests = testResults.filter(r => r.success);
  const failedTests = testResults.filter(r => !r.success);
  
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total Tests: ${testResults.length}`);
  console.log(`   ✅ Successful: ${successfulTests.length}`);
  console.log(`   ❌ Failed: ${failedTests.length}`);
  console.log(`   📊 Success Rate: ${((successfulTests.length / testResults.length) * 100).toFixed(1)}%`);
  console.log(`   ⏱️  Total Test Time: ${totalTestTime}ms`);
  
  // Response time statistics
  const responseTimes = successfulTests.map(r => r.responseTime);
  if (responseTimes.length > 0) {
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    
    console.log(`\n⚡ PERFORMANCE METRICS:`);
    console.log(`   Average Response Time: ${avgResponseTime.toFixed(1)}ms`);
    console.log(`   Fastest Response: ${minResponseTime}ms`);
    console.log(`   Slowest Response: ${maxResponseTime}ms`);
  }
  
  // Detailed results by endpoint
  console.log(`\n📋 DETAILED RESULTS:`);
  console.log('-'.repeat(60));
  
  testResults.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const statusCode = result.status || 'ERR';
    
    console.log(`${index + 1}. ${status} ${result.name}`);
    console.log(`   ${result.method} ${result.endpoint}`);
    console.log(`   Status: ${statusCode} | Response Time: ${result.responseTime}ms`);
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    if (result.success && result.data) {
      console.log(`   Data Preview: ${JSON.stringify(result.data).substring(0, 100)}...`);
    }
    
    console.log('');
  });
  
  // Failed tests summary
  if (failedTests.length > 0) {
    console.log(`\n❌ FAILED TESTS SUMMARY:`);
    console.log('-'.repeat(40));
    
    failedTests.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} (${result.method} ${result.endpoint})`);
      console.log(`   Status: ${result.status || 'Network Error'}`);
      console.log(`   Error: ${result.error}`);
      console.log('');
    });
  }
  
  // Endpoint categories performance
  console.log(`\n📊 PERFORMANCE BY CATEGORY:`);
  console.log('-'.repeat(40));
  
  const categories = {
    'Health': testResults.filter(r => r.endpoint.includes('/health') || r.endpoint.includes('/test')),
    'Services': testResults.filter(r => r.endpoint.includes('/lightning') || r.endpoint.includes('/phoenixd') || r.endpoint.includes('/fedimint')),
    'Family': testResults.filter(r => r.endpoint.includes('/family')),
    'Individual': testResults.filter(r => r.endpoint.includes('/individual')),
    'Payments': testResults.filter(r => r.endpoint.includes('/payments') || r.endpoint.includes('/bridge')),
  };
  
  Object.entries(categories).forEach(([category, results]) => {
    if (results.length > 0) {
      const successful = results.filter(r => r.success).length;
      const avgTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      
      console.log(`${category}: ${successful}/${results.length} success (${avgTime.toFixed(1)}ms avg)`);
    }
  });
  
  console.log('\n🎉 API Testing Complete!');
  console.log('='.repeat(60));
}

// Check if we can connect to the server first
async function checkServerConnection() {
  try {
    await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    return true;
  } catch {
    console.log('❌ Cannot connect to server. Please ensure the server is running on http://localhost:3000');
    console.log('   Start the server with: npm run dev');
    return false;
  }
}

// Run the tests
async function main() {
  console.log('🔍 Checking server connection...');
  
  const serverAvailable = await checkServerConnection();
  if (!serverAvailable) {
    process.exit(1);
  }
  
  console.log('✅ Server connection established');
  await runAllTests();
}

// Handle global fetch for Node.js environments and run main
async function init() {
  if (typeof fetch === 'undefined') {
    const { default: fetch } = await import('node-fetch');
    global.fetch = fetch;
  }
  await main();
}

init().catch(console.error);