# Pubky Debugging Guide

This guide provides instructions for setting up breakpoints to debug key components of the Pubky system.

## Setup

1. Open VS Code with the Satnam project
2. Make sure you have the necessary launch configurations in `.vscode/launch.json`
3. Set breakpoints at the locations described below

## Debugging Keypair Generation

To debug the keypair generation process in the `PubkyClient` class:

```typescript
// In EnhancedPubkyClient.generatePubkyKeypair() method
async generatePubkyKeypair(): Promise<PubkyKeypair> {
  // Set breakpoint here to verify keypair generation
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKey(privateKey); // Breakpoint
  
  const pubkyUrl = this.encodePubkyUrl(publicKey); // Breakpoint
  return { /* ... */ }
}
```

**Steps:**
1. Open `lib/pubky-enhanced-client.ts`
2. Set breakpoints at lines 146, 149, and 151
3. Launch the "Debug Pubky Client" configuration
4. Examine the `privateKey` and `publicKey` variables to ensure they're properly generated
5. Verify the `pubkyUrl` is correctly formatted as `pubky://{z32-encoded-public-key}`

## Debugging Domain Registration

To debug the PKARR record creation and signature process:

```typescript
// In EnhancedPubkyClient.registerPubkyDomain() method
async registerPubkyDomain(keypair, domainRecords) {
  // Breakpoint to check PKARR record creation
  const pkarrRecord = { /* ... */ } // Breakpoint
  
  // Breakpoint to verify signature
  const signature = await ed25519.sign(recordBytes, privateKey) // Breakpoint
  
  // Breakpoint to check relay publishing
  const publishResults = await Promise.all(/* ... */) // Breakpoint
}
```

**Steps:**
1. Open `lib/pubky-enhanced-client.ts`
2. Set breakpoints at lines 207, 222, and 232
3. Launch the "Debug Pubky Domain Registration" configuration
4. Examine the `pkarrRecord` object to ensure it contains the correct domain records
5. Verify the signature is being generated correctly
6. Check the `publishResults` to ensure successful publishing to PKARR relays

## Debugging WebSocket Subscriptions

To debug the WebSocket subscription handling:

```typescript
// In PubkyWebSocketHandler.handleSubscribe() method
async handlePubkySubscription(ws, message) {
  // Breakpoint to verify subscription logic
  const { pubky_url } = message // Breakpoint
  
  // Breakpoint to check database updates
  await this.subscribeToPubkyUrl(pubky_url) // Breakpoint
}
```

**Steps:**
1. Open `services/domain/PubkyWebSocketHandler.ts`
2. Set breakpoints at lines 227 and 229 in the `handleSubscribe` method
3. Launch the "Debug Pubky WebSocket Server" configuration
4. Connect to the WebSocket server with a test client
5. Send a subscription message with a Pubky URL
6. Verify the URL is correctly parsed and validated
7. Check that the subscription is properly stored in the client's subscriptions

## Testing the Complete Flow

To test the complete flow from keypair generation to domain registration to WebSocket notifications:

1. Launch the "Debug Pubky Backend" configuration
2. Launch the "Debug Pubky WebSocket Server" configuration
3. Run the integration tests with the "Debug Pubky Domain Registration" configuration
4. Observe the flow of data through the system
5. Verify that WebSocket notifications are sent when domain records are updated

## Troubleshooting

If you encounter issues:

1. Check the console output for error messages
2. Verify that the database connection is working properly
3. Ensure that the PKARR relays are accessible
4. Check that the WebSocket server is running on the expected port
5. Verify that the JWT authentication is working correctly for WebSocket connections