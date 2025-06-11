# Pubky Debugging Setup

This document provides instructions for setting up and using the debugging configurations for the Pubky system.

## Overview

The Pubky system consists of several components:

1. **Enhanced Pubky Client** - Core implementation of the Pubky protocol
2. **Pubky Client** - Service wrapper around the enhanced client
3. **Pubky WebSocket Handler** - Handles real-time updates for Pubky events
4. **WebSocket Server** - Serves WebSocket connections for the Pubky system

## Debugging Configurations

The following debugging configurations have been set up in `.vscode/launch.json`:

1. **Debug Pubky Backend** - Launches the main backend server
2. **Debug Pubky API Tests** - Runs the Pubky API tests
3. **Debug Pubky WebSocket Server** - Launches the WebSocket server
4. **Debug Pubky Client** - Runs tests for the enhanced Pubky client
5. **Debug Pubky Domain Registration** - Runs tests for domain registration
6. **Debug Pubky Specific Tests** - Runs the specific debug tests in `pubky-debug.test.ts`

## Setting Breakpoints

To debug the specific code snippets you provided, set breakpoints at the following locations:

### Keypair Generation

In `lib/pubky-enhanced-client.ts`:

```typescript
async generatePubkyKeypair(): Promise<PubkyKeypair> {
  // Set breakpoint here (line 143)
  const privateKey = ed25519.utils.randomPrivateKey(); // Breakpoint (line 146)
  const publicKey = await ed25519.getPublicKey(privateKey); // Breakpoint (line 149)
  const pubkyUrl = this.encodePubkyUrl(publicKey); // Breakpoint (line 151)
  // ...
}
```

### Domain Registration

In `lib/pubky-enhanced-client.ts`:

```typescript
async registerPubkyDomain(keypair, domainRecords): Promise<PubkyRegistrationResult> {
  // ...
  const pkarrRecord = { /* ... */ }; // Breakpoint (line 207)
  // ...
  const signature = await ed25519.sign(recordBytes, Buffer.from(keypair.private_key, 'hex')); // Breakpoint (line 222)
  // ...
  const publishResults = await Promise.all(/* ... */); // Breakpoint (line 232)
  // ...
}
```

### WebSocket Subscription

In `services/domain/PubkyWebSocketHandler.ts`:

```typescript
private async handleSubscribe(client: PubkyWebSocketClient, data: any) {
  // ...
  if (data.pubkyUrl) {
    // Validate the Pubky URL
    if (!this.isValidPubkyUrl(data.pubkyUrl)) { // Breakpoint (line 222)
      // ...
    }
    
    if (!client.subscriptions.pubkyUrls.includes(data.pubkyUrl)) {
      client.subscriptions.pubkyUrls.push(data.pubkyUrl); // Breakpoint (line 228)
    }
    // ...
  }
  // ...
}
```

## Running the Debug Tests

1. Open VS Code with the Satnam project
2. Set breakpoints at the locations described above
3. Select the "Debug Pubky Specific Tests" configuration from the Run and Debug panel
4. Click the green play button to start debugging
5. The tests will run and hit your breakpoints, allowing you to inspect variables and step through the code

## Debugging the WebSocket Server

To debug the WebSocket server:

1. Select the "Debug Pubky WebSocket Server" configuration
2. Click the green play button to start the server
3. In a separate terminal, run a WebSocket client to connect to the server
4. The server will hit your breakpoints when handling subscriptions

## Debugging the Complete Flow

To debug the complete flow:

1. Start the WebSocket server with "Debug Pubky WebSocket Server"
2. Start the backend with "Debug Pubky Backend"
3. Run the debug tests with "Debug Pubky Specific Tests"
4. Observe how the data flows through the system

## Troubleshooting

If you encounter issues:

- Make sure all required services are running (database, etc.)
- Check that the environment variables are set correctly
- Verify that the breakpoints are set at the correct locations
- Check the console output for error messages

For more detailed debugging instructions, see the [Pubky Debugging Guide](./pubky_debugging_guide.md).