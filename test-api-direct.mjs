// Direct test of API endpoints without server
// This helps us verify the API functions work correctly

// Import the API handlers
const healthHandler = require('./api/health.js').default;
const testHandler = require('./api/test.js').default;
const sessionHandler = require('./api/auth/session.js').default;

// Mock request and response objects
function createMockReq(method = 'GET', body = {}, query = {}, headers = {}) {
  return {
    method,
    body,
    query,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    
    status(code) {
      this.statusCode = code;
      return this;
    },
    
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    
    json(data) {
      this.body = JSON.stringify(data);
      console.log(`Response ${this.statusCode}:`, JSON.stringify(data, null, 2));
      return this;
    },
    
    end() {
      console.log(`Response ${this.statusCode}: (empty)`);
      return this;
    }
  };
  
  return res;
}

async function testEndpoint(name, handler, req) {
  console.log(`\n=== Testing ${name} ===`);
  console.log(`Request: ${req.method} ${req.url || 'N/A'}`);
  
  const res = createMockRes();
  
  try {
    await handler(req, res);
    console.log(`✅ ${name} completed successfully`);
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
  }
}

async function runTests() {
  console.log('🧪 Testing API Endpoints Directly\n');
  
  // Test health endpoint
  await testEndpoint('Health Check', healthHandler, createMockReq('GET'));
  
  // Test test endpoint
  await testEndpoint('Test Endpoint', testHandler, createMockReq('GET'));
  
  // Test auth session endpoint
  await testEndpoint('Auth Session', sessionHandler, createMockReq('GET'));
  
  // Test OPTIONS requests
  await testEndpoint('Health OPTIONS', healthHandler, createMockReq('OPTIONS'));
  
  // Test invalid methods
  await testEndpoint('Health POST (should fail)', healthHandler, createMockReq('POST'));
  
  console.log('\n🎉 All tests completed!');
}

// Run the tests
runTests().catch(console.error);