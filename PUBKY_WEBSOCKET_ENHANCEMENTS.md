# Pubky WebSocket Enhancements

This document outlines the enhancements made to the WebSocket service to support real-time Pubky domain management.

## Overview

The WebSocket service has been enhanced to provide real-time updates for Pubky domain management, including domain resolution updates, sovereignty score changes, guardian notifications, and PKARR relay status monitoring.

## Key Features Implemented

### PUBKY WEBSOCKET FEATURES

1. **Real-time Pubky Domain Resolution Updates**
   - WebSocket subscriptions to Pubky URLs
   - Real-time content updates when Pubky content changes
   - Notification system for Pubky domain events

2. **Live Sovereignty Score Changes**
   - Real-time updates when sovereignty scores change
   - Detailed breakdown of sovereignty components
   - Historical sovereignty score tracking

3. **Guardian Notifications**
   - Real-time updates on guardian status
   - Notifications for guardian actions
   - Family domain sharing and collaboration

4. **PKARR Relay Status Monitoring**
   - Real-time monitoring of PKARR relay connectivity
   - Alerts for relay outages or issues
   - Performance metrics for relay operations

### SECURITY ENHANCEMENTS

1. **JWT-based Authentication**
   - Secure authentication for WebSocket connections
   - Token validation and user verification
   - Session management and expiration

2. **Rate Limiting**
   - Maximum subscription limits per client
   - Request throttling for high-frequency operations
   - Protection against abuse and DoS attacks

3. **Access Control**
   - Fine-grained access control for Pubky URLs
   - Family-based permission system
   - Public vs. private Pubky content management

4. **Audit Logging**
   - Comprehensive logging of all Pubky operations
   - User activity tracking
   - Security event monitoring

### PERFORMANCE OPTIMIZATIONS

1. **Connection Pooling**
   - Efficient management of WebSocket connections
   - Resource optimization for high-concurrency scenarios
   - Connection cleanup and maintenance

2. **Content Caching**
   - In-memory caching of frequently accessed Pubky content
   - TTL-based cache expiration
   - Cache invalidation on content updates

3. **Batch Processing**
   - Efficient handling of multiple subscriptions
   - Batched database operations
   - Optimized notification delivery

## Implementation Details

### WebSocket Message Types

The WebSocket service now supports the following Pubky-specific message types:

1. **subscribe** - Subscribe to a Pubky URL
2. **unsubscribe** - Unsubscribe from a Pubky URL
3. **pubky_relay_status** - Get the status of PKARR relays
4. **pubky_resolve** - Resolve a Pubky URL
5. **pubky_sovereignty_score** - Get the sovereignty score for a Pubky domain
6. **pubky_guardian_status** - Get the status of guardians for a family

### Response Message Types

The service sends the following response message types:

1. **subscribed** - Confirmation of subscription
2. **unsubscribed** - Confirmation of unsubscription
3. **pubky_content_update** - Update to Pubky content
4. **pubky_relay_status** - Status of PKARR relays
5. **pubky_resolve_result** - Result of Pubky URL resolution
6. **pubky_sovereignty_score** - Sovereignty score for a Pubky domain
7. **pubky_guardian_status** - Status of guardians for a family
8. **pubky_subscription_error** - Error in Pubky subscription
9. **error** - General error message

### Data Structures

The service uses the following data structures for Pubky management:

1. **PubkySubscription** - Tracks subscriptions to Pubky URLs
2. **WebSocketClient** - Represents a connected client with subscriptions
3. **PubkyContentCache** - Caches resolved Pubky content

### Security Implementation

1. **Authentication** - JWT-based authentication for all connections
2. **Access Control** - Checks for access to Pubky URLs based on ownership, family membership, and explicit grants
3. **Rate Limiting** - Limits the number of subscriptions per client
4. **Audit Logging** - Logs all Pubky activities for security and compliance

## Usage Examples

### Subscribing to a Pubky URL

```javascript
// Client-side code
const socket = new WebSocket('wss://api.example.com/ws?token=YOUR_JWT_TOKEN');

socket.onopen = () => {
  // Subscribe to a Pubky URL
  socket.send(JSON.stringify({
    type: 'subscribe',
    data: {
      pubkyUrl: 'pubky://abc123/example'
    }
  }));
};

// Handle subscription confirmation
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'subscribed' && message.data.entity === 'pubkyUrl') {
    console.log(`Subscribed to ${message.data.url}`);
  }
  
  // Handle content updates
  if (message.type === 'pubky_content_update') {
    console.log(`Content updated for ${message.data.url}:`, message.data.content);
  }
};
```

### Checking PKARR Relay Status

```javascript
// Client-side code
socket.send(JSON.stringify({
  type: 'pubky_relay_status'
}));

// Handle relay status response
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'pubky_relay_status') {
    console.log('PKARR Relay Status:', message.data.relays);
  }
};
```

### Getting Sovereignty Score

```javascript
// Client-side code
socket.send(JSON.stringify({
  type: 'pubky_sovereignty_score',
  data: {
    url: 'pubky://abc123/example'
  }
}));

// Handle sovereignty score response
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'pubky_sovereignty_score') {
    console.log(`Sovereignty Score for ${message.data.url}:`, message.data.sovereignty_score);
    console.log('Score Components:', message.data.components);
  }
};
```

## Future Enhancements

1. **WebSocket Compression**
   - Implement message compression for bandwidth optimization
   - Support for per-message deflate extension

2. **Enhanced Notification Filtering**
   - Allow clients to specify notification filters
   - Support for conditional subscriptions

3. **Multi-server Scaling**
   - Redis pub/sub for cross-server notifications
   - Distributed WebSocket server architecture

4. **Advanced Analytics**
   - Real-time analytics for Pubky domain usage
   - Performance metrics and insights