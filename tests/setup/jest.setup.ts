/**
 * Jest Setup
 * 
 * This file configures the Jest testing environment.
 */

import { mockDb } from '../helpers/mock-db';

// Mock the database module
jest.mock('../../lib/db', () => ({
  query: jest.fn().mockImplementation(mockDb.query)
}));

// Mock the WebSocket module
jest.mock('ws', () => {
  class MockWebSocket {
    readyState = 1; // OPEN
    
    constructor() {
      // Initialize event handlers
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
    }
    
    send(data: string) {
      // Simulate receiving a message
      if (this.onmessage) {
        this.onmessage({ data });
      }
    }
    
    close() {
      this.readyState = 3; // CLOSED
      if (this.onclose) {
        this.onclose();
      }
    }
    
    // Event handlers
    onmessage: ((event: any) => void) | null;
    onclose: (() => void) | null;
    onerror: ((error: any) => void) | null;
  }
  
  class MockWebSocketServer {
    clients = new Set();
    
    constructor() {
      // Initialize event handlers
      this.on = jest.fn();
    }
    
    on = jest.fn();
    
    close(callback: () => void) {
      callback();
    }
  }
  
  const mockExport: any = function (..._args: any[]) { return new MockWebSocket(); };
  mockExport.Server = MockWebSocketServer;
  mockExport.OPEN = 1;
  mockExport.CLOSING = 2;
  mockExport.CLOSED = 3;
  
  return mockExport;
});

// Mock the axios module
jest.mock('axios', () => ({
  get: jest.fn().mockImplementation((url) => {
    return Promise.resolve({
      status: 200,
      data: {
        Answer: [
          {
            type: 16, // TXT
            data: 'pubky-verification=true'
          }
        ]
      }
    });
  }),
  post: jest.fn().mockImplementation((url, data) => {
    return Promise.resolve({
      status: 200,
      data: {
        success: true
      }
    });
  }),
  put: jest.fn().mockImplementation((url, data) => {
    return Promise.resolve({
      status: 200,
      data: {
        success: true
      }
    });
  }),
  delete: jest.fn().mockImplementation((url) => {
    return Promise.resolve({
      status: 200,
      data: {
        success: true
      }
    });
  })
}));

// Mock the pg module
jest.mock('pg', () => {
  class MockClient {
    connect = jest.fn().mockResolvedValue(undefined);
    query = jest.fn().mockImplementation(mockDb.query);
    end = jest.fn().mockResolvedValue(undefined);
    on = jest.fn();
  }
  
  class MockPool {
    connect = jest.fn().mockResolvedValue({
      query: jest.fn().mockImplementation(mockDb.query),
      release: jest.fn()
    });
    query = jest.fn().mockImplementation(mockDb.query);
    end = jest.fn().mockResolvedValue(undefined);
  }
  
  return {
    Client: MockClient,
    Pool: MockPool
  };
});

// Global test setup
beforeAll(() => {
  // Set up global test environment
  console.log('Setting up test environment');
  
  // Reset mock database
  mockDb.reset();
  
  // Reset all mocks
  jest.clearAllMocks();
});

// Global test teardown
afterAll(() => {
  // Clean up global test environment
  console.log('Tearing down test environment');
});

// Set up console mocks to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};