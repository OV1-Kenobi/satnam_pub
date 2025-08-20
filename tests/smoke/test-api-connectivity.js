#!/usr/bin/env node

/**
 * API Connectivity Test Script
 * Tests both direct backend and Vite proxy connectivity
 */

import http from 'http';
import https from 'https';

// Test configuration
const tests = [
  {
    name: 'Direct Backend Health Check',
    url: 'http://localhost:8000/api/health',
    expectedStatus: 200
  },
  {
    name: 'Direct Backend Auth Session',
    url: 'http://localhost:8000/api/auth/session',
    expectedStatus: 401 // Expected - no active session
  },
  {
    name: 'Vite Proxy Health Check',
    url: 'http://localhost:3002/api/health',
    expectedStatus: 200
  },
  {
    name: 'Vite Proxy Auth Session',
    url: 'http://localhost:3002/api/auth/session',
    expectedStatus: 401 // Expected - no active session
  }
];

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 API Connectivity Test Suite');
  console.log('================================\n');
  
  let passedTests = 0;
  const totalTests = tests.length;
  
  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      console.log(`URL: ${test.url}`);
      
      const result = await makeRequest(test.url);
      
      const statusMatch = result.statusCode === test.expectedStatus;
      const hasJsonResponse = result.body.trim().startsWith('{');
      
      if (statusMatch && hasJsonResponse) {
        console.log(`✅ PASS - Status: ${result.statusCode}`);
        
        try {
          const jsonData = JSON.parse(result.body);
          console.log(`   Response: ${JSON.stringify(jsonData, null, 2)}`);
        } catch {
          console.log(`   Response: ${result.body}`);
        }
        
        passedTests++;
      } else {
        console.log(`❌ FAIL - Status: ${result.statusCode} (expected ${test.expectedStatus})`);
        console.log(`   Response: ${result.body}`);
      }
      
    } catch (error) {
      console.log(`❌ FAIL - Error: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }
  
  console.log('================================');
  console.log(`Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! API connectivity is working correctly.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check server status and configuration.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});