#!/usr/bin/env node

/**
 * Test Pattern Matching for Netlify Redirects
 */

function testPatternMatching() {
  console.log('🧪 Testing Netlify Redirect Pattern Matching');
  console.log('=' .repeat(50));

  const patterns = [
    {
      pattern: '/api/authenticated/*invite*',
      testUrls: [
        '/api/authenticated/generate-peer-invite',
        '/api/authenticated/create-family-invite',
        '/api/authenticated/send-invite-message',
        '/api/authenticated/peer-invite-status',
        '/api/authenticated/other-endpoint'
      ]
    }
  ];

  patterns.forEach(({ pattern, testUrls }) => {
    console.log(`\n📝 Testing pattern: ${pattern}`);
    console.log('-'.repeat(40));

    // Convert Netlify pattern to regex
    // * matches any characters except /
    // ** matches any characters including /
    const regexPattern = pattern
      .replace(/\*/g, '[^/]*');  // * becomes [^/]*
    
    const regex = new RegExp(`^${regexPattern}$`);
    console.log(`📊 Converted to regex: ${regex}`);

    testUrls.forEach(url => {
      const matches = regex.test(url);
      const status = matches ? '✅' : '❌';
      console.log(`${status} ${url} → ${matches ? 'MATCH' : 'NO MATCH'}`);
    });
  });

  console.log('\n💡 Analysis:');
  console.log('- The pattern /api/authenticated/*-invite* should match URLs containing "-invite"');
  console.log('- generate-peer-invite contains "-invite" so it should match');
  console.log('- If it\'s not matching, there might be a Netlify configuration issue');
}

testPatternMatching();
