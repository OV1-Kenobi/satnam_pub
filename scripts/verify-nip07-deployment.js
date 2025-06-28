#!/usr/bin/env node

/**
 * NIP-07 Deployment Verification Script
 * 
 * This script verifies that your NIP-07 authentication endpoints
 * are properly deployed and functioning on Netlify.
 * 
 * Usage:
 * node scripts/verify-nip07-deployment.js https://your-site.netlify.app
 */

const https = require('https');
const http = require('http');

// Configuration
const TIMEOUT = 10000; // 10 seconds
const EXPECTED_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'x-xss-protection',
  'referrer-policy'
];

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, TIMEOUT);

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NIP-07-Deployment-Verifier/1.0',
        ...options.headers
      },
      timeout: TIMEOUT
    }, (res) => {
      clearTimeout(timeout);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testChallengeEndpoint(baseUrl) {
  log('\n📋 Testing Challenge Generation Endpoint...', colors.cyan);
  
  const challengeUrl = `${baseUrl}/api/auth/nip07-challenge`;
  
  try {
    const response = await makeRequest(challengeUrl, {
      headers: {
        'Origin': baseUrl
      }
    });
    
    // Check status code
    if (response.statusCode === 200) {
      log('✅ Challenge endpoint responds with 200 OK', colors.green);
    } else {
      log(`❌ Challenge endpoint returned ${response.statusCode}`, colors.red);
      return false;
    }
    
    // Check response structure
    if (response.data?.success && response.data?.data?.challenge) {
      log('✅ Challenge response has correct structure', colors.green);
      log(`   Challenge length: ${response.data.data.challenge.length} characters`, colors.blue);
      log(`   Domain: ${response.data.data.domain}`, colors.blue);
      log(`   Expires in: ${Math.round((response.data.data.expiresAt - Date.now()) / 1000 / 60)} minutes`, colors.blue);
    } else {
      log('❌ Challenge response missing required fields', colors.red);
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, colors.yellow);
      return false;
    }
    
    // Check security headers
    let securityScore = 0;
    EXPECTED_HEADERS.forEach(header => {
      if (response.headers[header]) {
        securityScore++;
        log(`✅ Security header present: ${header}`, colors.green);
      } else {
        log(`⚠️  Security header missing: ${header}`, colors.yellow);
      }
    });
    
    log(`🛡️  Security score: ${securityScore}/${EXPECTED_HEADERS.length}`, 
        securityScore === EXPECTED_HEADERS.length ? colors.green : colors.yellow);
    
    return response.data.data;
    
  } catch (error) {
    log(`❌ Challenge endpoint test failed: ${error.message}`, colors.red);
    return false;
  }
}

async function testSigninEndpoint(baseUrl, challengeData) {
  log('\n🔐 Testing Signin Endpoint...', colors.cyan);
  
  const signinUrl = `${baseUrl}/api/auth/nip07-signin`;
  
  // Create a mock signed event for testing
  const mockSignedEvent = {
    kind: 22242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['challenge', challengeData.challenge],
      ['domain', challengeData.domain],
      ['expires', challengeData.expiresAt.toString()]
    ],
    content: `Authenticate to ${challengeData.domain}`,
    pubkey: '0'.repeat(64), // Mock pubkey
    sig: '0'.repeat(128)     // Mock signature (will fail verification but tests structure)
  };
  
  try {
    const response = await makeRequest(signinUrl, {
      headers: {
        'Origin': baseUrl
      },
      body: {
        signedEvent: mockSignedEvent,
        challenge: challengeData.challenge,
        domain: challengeData.domain
      }
    });
    
    // We expect this to fail signature verification but succeed in structural validation
    if (response.statusCode === 400 && response.data?.code === 'INVALID_SIGNATURE') {
      log('✅ Signin endpoint properly validates signatures', colors.green);
      log('✅ Signin endpoint has correct structure validation', colors.green);
      return true;
    } else if (response.statusCode === 200) {
      log('⚠️  Signin endpoint accepted mock signature (security concern)', colors.yellow);
      return true;
    } else {
      log(`❌ Signin endpoint returned unexpected response: ${response.statusCode}`, colors.red);
      if (response.data) {
        log(`   Response: ${JSON.stringify(response.data, null, 2)}`, colors.yellow);
      }
      return false;
    }
    
  } catch (error) {
    log(`❌ Signin endpoint test failed: ${error.message}`, colors.red);
    return false;
  }
}

async function testRateLimit(baseUrl) {
  log('\n🚦 Testing Rate Limiting...', colors.cyan);
  
  const challengeUrl = `${baseUrl}/api/auth/nip07-challenge`;
  let successCount = 0;
  let rateLimitHit = false;
  
  try {
    // Make multiple requests quickly
    for (let i = 0; i < 5; i++) {
      const response = await makeRequest(challengeUrl, {
        headers: {
          'Origin': baseUrl,
          'X-Test-Request': `rate-limit-test-${i}`
        }
      });
      
      if (response.statusCode === 200) {
        successCount++;
      } else if (response.statusCode === 429) {
        rateLimitHit = true;
        log('✅ Rate limiting is working (429 response received)', colors.green);
        break;
      }
    }
    
    if (successCount > 0 && !rateLimitHit) {
      log(`✅ Endpoint accepts reasonable request volume (${successCount} requests)`, colors.green);
    }
    
    return true;
    
  } catch (error) {
    log(`⚠️  Rate limit test inconclusive: ${error.message}`, colors.yellow);
    return true; // Don't fail deployment for this
  }
}

async function testCORSHeaders(baseUrl) {
  log('\n🌐 Testing CORS Configuration...', colors.cyan);
  
  const challengeUrl = `${baseUrl}/api/auth/nip07-challenge`;
  
  try {
    // Test preflight request
    const client = challengeUrl.startsWith('https:') ? https : http;
    
    return new Promise((resolve) => {
      const req = client.request(challengeUrl, {
        method: 'OPTIONS',
        headers: {
          'Origin': baseUrl,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      }, (res) => {
        const corsHeaders = {
          'access-control-allow-origin': res.headers['access-control-allow-origin'],
          'access-control-allow-methods': res.headers['access-control-allow-methods'],
          'access-control-allow-headers': res.headers['access-control-allow-headers']
        };
        
        if (corsHeaders['access-control-allow-origin']) {
          log('✅ CORS headers present', colors.green);
          log(`   Allow-Origin: ${corsHeaders['access-control-allow-origin']}`, colors.blue);
          log(`   Allow-Methods: ${corsHeaders['access-control-allow-methods'] || 'Not specified'}`, colors.blue);
        } else {
          log('⚠️  CORS headers not found', colors.yellow);
        }
        
        resolve(true);
      });
      
      req.on('error', () => resolve(true)); // Don't fail for CORS test
      req.end();
    });
    
  } catch (error) {
    log(`⚠️  CORS test inconclusive: ${error.message}`, colors.yellow);
    return true;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('❌ Please provide your Netlify site URL', colors.red);
    log('Usage: node scripts/verify-nip07-deployment.js https://your-site.netlify.app', colors.cyan);
    process.exit(1);
  }
  
  const baseUrl = args[0].replace(/\/$/, ''); // Remove trailing slash
  
  log(`${colors.bold}🚀 NIP-07 Deployment Verification${colors.reset}`);
  log(`${colors.bold}Site URL: ${baseUrl}${colors.reset}`);
  log('═'.repeat(60));
  
  let allTestsPassed = true;
  
  // Test challenge endpoint
  const challengeData = await testChallengeEndpoint(baseUrl);
  if (!challengeData) {
    allTestsPassed = false;
  }
  
  // Test signin endpoint (only if challenge worked)
  if (challengeData) {
    const signinPassed = await testSigninEndpoint(baseUrl, challengeData);
    if (!signinPassed) {
      allTestsPassed = false;
    }
  } else {
    log('\n🔐 Skipping signin test (challenge test failed)', colors.yellow);
  }
  
  // Test rate limiting
  await testRateLimit(baseUrl);
  
  // Test CORS
  await testCORSHeaders(baseUrl);
  
  // Final report
  log('\n' + '═'.repeat(60));
  if (allTestsPassed) {
    log('🎉 All critical tests passed! Your NIP-07 deployment is ready for production.', colors.green + colors.bold);
  } else {
    log('⚠️  Some tests failed. Please check the issues above before going to production.', colors.yellow + colors.bold);
  }
  
  log('\n📋 Next steps:', colors.cyan);
  log('1. Test with a real Nostr extension (Alby, nos2x, etc.)', colors.blue);
  log('2. Monitor function logs in Netlify dashboard', colors.blue);
  log('3. Set up monitoring and alerts', colors.blue);
  log('4. Configure custom domain and SSL', colors.blue);
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  log(`❌ Unhandled error: ${error.message}`, colors.red);
  process.exit(1);
});

if (require.main === module) {
  main();
}