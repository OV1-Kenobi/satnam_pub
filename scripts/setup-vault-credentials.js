/**
 * @fileoverview One-time Vault Setup Script
 * @description Securely stores service role key in Supabase Vault
 * ⚠️ Run this ONCE during initial setup, then delete the service role key from environment
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function setupVaultCredentials() {
  console.log('🔒 SECURE VAULT SETUP - ONE-TIME INITIALIZATION');
  console.log('═══════════════════════════════════════════════');
  console.log();
  console.log('This script will securely store your service role key in Supabase Vault.');
  console.log('After this setup, the service role key will never be stored in environment files.');
  console.log();

  try {
    // Get credentials
    const supabaseUrl = await prompt('Enter your Supabase URL (e.g., https://your-project.supabase.co): ');
    const serviceRoleKey = await prompt('Enter your Service Role Key (starts with eyJ): ');
    
    console.log();
    console.log('Validating credentials...');
    
    // Validate inputs
    if (!supabaseUrl.includes('supabase.co')) {
      throw new Error('Invalid Supabase URL format');
    }
    
    if (!serviceRoleKey.startsWith('eyJ')) {
      throw new Error('Invalid service role key format (should start with eyJ)');
    }

    // Create temporary Supabase client for setup
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Test the connection
    console.log('Testing Supabase connection...');
    const { error: testError } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });
    
    if (testError && !testError.message.includes('relation "profiles" does not exist')) {
      throw new Error(`Connection test failed: ${testError.message}`);
    }
    
    console.log('✅ Connection successful!');
    console.log();
    
    // Store service role key in Vault
    console.log('Storing service role key in Supabase Vault...');
    
    const { error: vaultError } = await supabase
      .rpc('vault_write', {
        secret_name: 'supabase_service_role_key',
        secret_value: serviceRoleKey
      });
    
    if (vaultError) {
      throw new Error(`Failed to store in Vault: ${vaultError.message}`);
    }
    
    console.log('✅ Service role key securely stored in Vault!');
    console.log();
    
    // Verify we can read it back
    console.log('Verifying Vault storage...');
    const { data: readBack, error: readError } = await supabase
      .rpc('vault_read', { secret_name: 'supabase_service_role_key' });
    
    if (readError || !readBack) {
      throw new Error('Failed to verify Vault storage');
    }
    
    console.log('✅ Vault verification successful!');
    console.log();
    
    // Success instructions
    console.log('🎉 VAULT SETUP COMPLETE!');
    console.log('═══════════════════════');
    console.log();
    console.log('✅ Your service role key is now securely stored in Supabase Vault');
    console.log('✅ API routes will retrieve it securely at runtime');
    console.log('✅ No sensitive credentials are exposed in environment files');
    console.log();
    console.log('NEXT STEPS:');
    console.log('1. Set SUPABASE_SERVICE_ROLE_KEY_VAULT_FALLBACK in your production environment');
    console.log('2. Test your API endpoints to ensure Vault access works');
    console.log('3. Deploy with confidence - no credentials in code!');
    console.log();
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log();
    console.log('Please check your credentials and try again.');
  } finally {
    rl.close();
  }
}

// Run the setup
setupVaultCredentials().catch(console.error);