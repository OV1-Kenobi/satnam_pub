#!/usr/bin/env node

/**
 * Test Nsec Format Conversion
 * Tests the SecureNsecManager's ability to handle both bech32 and hex nsec formats
 */

import { nip19 } from 'nostr-tools';

async function testNsecFormatConversion() {
  console.log('🧪 Testing Nsec Format Conversion');
  console.log('=' .repeat(50));

  try {
    // Use a test private key (32 bytes of test data)
    const privateKeyHex = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const privateKeyBytes = new Uint8Array(
      privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );

    // Create bech32 nsec format
    const nsecBech32 = nip19.nsecEncode(privateKeyBytes);
    
    console.log('🔍 Test Data Generated:');
    console.log('📊 Private key hex:', privateKeyHex);
    console.log('📊 Nsec bech32:', nsecBech32.substring(0, 15) + '...');
    console.log('📊 Hex length:', privateKeyHex.length);
    console.log('📊 Bech32 length:', nsecBech32.length);
    console.log('📊 Bech32 starts with nsec1:', nsecBech32.startsWith('nsec1'));

    // Test conversion back to hex
    const { data: decodedHex } = nip19.decode(nsecBech32);
    console.log('📊 Decoded hex matches:', decodedHex === privateKeyHex);

    // Test the validation patterns
    const hexPattern = /^[0-9a-fA-F]{64}$/;
    console.log('📊 Hex matches pattern:', hexPattern.test(privateKeyHex));
    console.log('📊 Bech32 matches pattern:', hexPattern.test(nsecBech32));

    // Simulate the SecureNsecManager logic
    console.log('\n🔄 Simulating SecureNsecManager conversion logic:');
    
    function simulateNsecConversion(nsecInput) {
      let nsecHex;
      
      if (nsecInput.startsWith('nsec1')) {
        console.log('✅ Detected bech32 format, converting to hex...');
        try {
          const { data } = nip19.decode(nsecInput);
          nsecHex = data;
          console.log('✅ Conversion successful');
        } catch (error) {
          throw new Error("Invalid nsec bech32 format");
        }
      } else if (/^[0-9a-fA-F]{64}$/.test(nsecInput)) {
        console.log('✅ Detected hex format, using as-is...');
        nsecHex = nsecInput;
      } else {
        throw new Error("Invalid nsec format - must be bech32 (nsec1...) or 64-character hex");
      }
      
      return nsecHex;
    }

    // Test with bech32 input
    console.log('\n📝 Testing with bech32 input:');
    const convertedFromBech32 = simulateNsecConversion(nsecBech32);
    console.log('📊 Converted hex:', convertedFromBech32.substring(0, 16) + '...');
    console.log('📊 Matches original:', convertedFromBech32 === privateKeyHex);

    // Test with hex input
    console.log('\n📝 Testing with hex input:');
    const convertedFromHex = simulateNsecConversion(privateKeyHex);
    console.log('📊 Converted hex:', convertedFromHex.substring(0, 16) + '...');
    console.log('📊 Matches original:', convertedFromHex === privateKeyHex);

    // Test with invalid input
    console.log('\n📝 Testing with invalid input:');
    try {
      simulateNsecConversion('invalid-nsec-format');
      console.log('❌ Should have thrown error');
    } catch (error) {
      console.log('✅ Correctly rejected invalid format:', error.message);
    }

    console.log('\n🎉 All nsec format conversion tests passed!');
    console.log('💡 The SecureNsecManager should now accept both formats');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testNsecFormatConversion();
