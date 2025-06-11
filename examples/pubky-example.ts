/**
 * Pubky Enhanced Client Example
 * 
 * This example demonstrates how to use the enhanced Pubky client for domain management.
 */

import { EnhancedPubkyClient } from '../lib/pubky-enhanced-client';
import { v4 as uuidv4 } from 'uuid';

// Create a client instance
const client = new EnhancedPubkyClient({
  homeserver_url: 'https://homeserver.pubky.org',
  pkarr_relays: [
    'https://pkarr.relay.pubky.tech',
    'https://pkarr.relay.synonym.to'
  ],
  debug: true
});

async function runPubkyExample() {
  try {
    console.log('Pubky Enhanced Client Example');
    console.log('----------------------------');
    
    // Step 1: Generate a keypair
    console.log('\n1. Generating Pubky keypair...');
    const keypair = await client.generatePubkyKeypair();
    console.log(`Generated keypair with public key: ${keypair.public_key.substring(0, 10)}...`);
    console.log(`Pubky URL: ${keypair.pubky_url}`);
    
    // Step 2: Register a domain
    console.log('\n2. Registering Pubky domain...');
    const domainRecords = [
      {
        name: '@',
        type: 'TXT',
        value: 'pubky-verification=true',
        ttl: 3600
      },
      {
        name: '_pubky',
        type: 'TXT',
        value: 'v=pubky1',
        ttl: 3600
      },
      {
        name: 'www',
        type: 'A',
        value: '192.168.1.1',
        ttl: 3600
      }
    ];
    
    const registration = await client.registerPubkyDomain(keypair, domainRecords);
    console.log(`Domain registered: ${registration.pubky_url}`);
    console.log(`Sovereignty score: ${registration.sovereignty_score}`);
    
    // Step 3: Publish content
    console.log('\n3. Publishing content to Pubky URL...');
    const content = {
      title: 'Hello Pubky',
      content: 'This is a test document published to a Pubky URL',
      timestamp: new Date().toISOString()
    };
    
    const publishResult = await client.publishContent(
      keypair,
      '/hello',
      content,
      'application/json'
    );
    
    console.log(`Content published: ${publishResult.pubky_url}`);
    console.log(`Content hash: ${publishResult.content_hash.substring(0, 10)}...`);
    
    // Step 4: Resolve content
    console.log('\n4. Resolving content from Pubky URL...');
    const resolvedContent = await client.resolvePubkyUrl(`${keypair.pubky_url}/hello`);
    
    if (resolvedContent) {
      console.log('Content resolved successfully:');
      console.log(`Title: ${resolvedContent.content.title}`);
      console.log(`Timestamp: ${resolvedContent.content.timestamp}`);
    } else {
      console.log('Failed to resolve content');
    }
    
    // Step 5: Create family domain with guardians
    console.log('\n5. Creating family domain with guardians...');
    
    // Generate guardian keypairs
    const guardianKeypairs = [];
    for (let i = 0; i < 3; i++) {
      guardianKeypairs.push(await client.generatePubkyKeypair());
    }
    
    console.log(`Generated ${guardianKeypairs.length} guardian keypairs`);
    
    // Migrate a traditional domain to Pubky
    const familyId = `family-${uuidv4()}`;
    const traditionalDomain = `family-${uuidv4().substring(0, 8)}.com`;
    
    const migration = await client.migrateFamilyDomainToPubky(
      traditionalDomain,
      familyId,
      guardianKeypairs
    );
    
    console.log(`Family domain migrated: ${migration.pubky_url}`);
    console.log(`Sovereignty improvement: ${migration.sovereignty_score_improvement}`);
    
    // Step 6: Create domain backup
    console.log('\n6. Creating domain backup...');
    
    const domainData = {
      domain_name: 'example.pubky',
      records: domainRecords,
      metadata: {
        created_at: new Date().toISOString(),
        owner: 'Example User'
      }
    };
    
    const backupUrls = await client.createDomainBackup(
      keypair,
      domainData,
      guardianKeypairs
    );
    
    console.log(`Created ${backupUrls.length} backup copies with guardians`);
    console.log(`First backup URL: ${backupUrls[0]}`);
    
    // Step 7: Verify domain ownership
    console.log('\n7. Verifying domain ownership...');
    
    const isOwner = await client.verifyDomainOwnership(
      keypair.pubky_url,
      keypair.private_key
    );
    
    console.log(`Domain ownership verified: ${isOwner}`);
    
    console.log('\nPubky example completed successfully!');
  } catch (error) {
    console.error('Error running Pubky example:', error);
  }
}

// Run the example
runPubkyExample();