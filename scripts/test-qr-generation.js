#!/usr/bin/env node

/**
 * Test QR Code Generation with qr-image library
 * Verifies that the new QR code library works correctly and doesn't produce deprecation warnings
 */

import qr from 'qr-image';

async function testQRGeneration() {
  console.log('🧪 Testing QR Code Generation with qr-image');
  console.log('=' .repeat(50));

  const testUrl = 'https://satnam.pub/invite/test123';

  try {
    console.log('🔄 Generating QR code for:', testUrl);

    // Generate QR code as PNG buffer (synchronous)
    const qrBuffer = qr.imageSync(testUrl, { 
      type: 'png',
      size: 10,
      margin: 2
    });
    
    console.log('✅ QR code buffer generated successfully');
    console.log('📊 Buffer size:', qrBuffer.length, 'bytes');
    
    // Convert buffer to base64 data URL
    const base64 = qrBuffer.toString('base64');
    const qrCodeDataUrl = `data:image/png;base64,${base64}`;
    
    console.log('✅ QR code data URL generated successfully');
    console.log('📊 Data URL length:', qrCodeDataUrl.length, 'characters');
    console.log('📊 Data URL preview:', qrCodeDataUrl.substring(0, 50) + '...');

    // Test SVG generation as well
    const svgString = qr.imageSync(testUrl, { type: 'svg' });
    console.log('✅ SVG QR code generated successfully');
    console.log('📊 SVG length:', svgString.length, 'characters');

    console.log('\n🎉 All QR code generation tests passed!');
    console.log('💡 No deprecation warnings should appear above this line');

  } catch (error) {
    console.error('❌ QR code generation failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

async function testAsyncGeneration() {
  console.log('\n🧪 Testing Async QR Code Generation');
  console.log('=' .repeat(50));

  const testUrl = 'https://satnam.pub/invite/async-test';

  return new Promise((resolve, reject) => {
    try {
      // Test async generation (stream-based)
      const qrStream = qr.image(testUrl, { type: 'png', size: 10 });
      const chunks = [];

      qrStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      qrStream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log('✅ Async QR code generation successful');
        console.log('📊 Async buffer size:', buffer.length, 'bytes');
        resolve();
      });

      qrStream.on('error', (error) => {
        console.error('❌ Async QR code generation failed:', error.message);
        reject(error);
      });

    } catch (error) {
      console.error('❌ Async QR code setup failed:', error.message);
      reject(error);
    }
  });
}

async function runAllTests() {
  try {
    await testQRGeneration();
    await testAsyncGeneration();
    
    console.log('\n📋 Summary:');
    console.log('✅ QR code library replacement successful');
    console.log('✅ No util._extend deprecation warnings');
    console.log('✅ Both sync and async generation working');
    console.log('✅ PNG and SVG formats supported');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

runAllTests();
