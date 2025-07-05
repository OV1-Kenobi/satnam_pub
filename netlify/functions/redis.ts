import { createClient } from "redis";
import { config } from "../config";
import { EventEmitter } from "events";

// Configuration for reconnection
const RECONNECT_MAX_ATTEMPTS = 10;
const RECONNECT_INITIAL_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

// Redis connection states
enum RedisConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  FAILED = "failed",
}

// Create Redis event emitter for application-wide notifications
export const redisEvents = new EventEmitter();

// Create Redis client
const redisClient = createClient({
  url: config.redis.url,
  socket: {
    reconnectStrategy: (retries) => {
      // Implement exponential backoff with jitter
      if (retries >= RECONNECT_MAX_ATTEMPTS) {
        // Maximum reconnection attempts reached - emit critical failure event
        redisEvents.emit(
          "critical-failure",
          new Error("Maximum reconnection attempts reached"),
        );
        return new Error("Maximum reconnection attempts reached");
      }

      // Calculate delay with exponential backoff and some randomness (jitter)
      const delay = Math.min(
        RECONNECT_INITIAL_DELAY * Math.pow(2, retries) + Math.random() * 1000,
        RECONNECT_MAX_DELAY,
      );

      // Logging reconnection attempt with calculated delay
      return delay;
    },
  },
});

// Track connection state
let connectionState = RedisConnectionState.DISCONNECTED;
let isReconnecting = false;
let reconnectAttempt = 0;
let connecting = false;
let healthCheckTimer: NodeJS.Timeout | null = null;

// Handle Redis connection events
redisClient.on("error", (err) => {
  // Handle Redis connection errors with appropriate recovery strategies

  /*
   * Error categorization for intelligent handling
   * Different error types require different recovery strategies
   */
  const errorMessage = err.message.toLowerCase();
  if (errorMessage.includes("connect") || errorMessage.includes("network")) {
    // Network-related errors - emit event for application to handle
    redisEvents.emit("connection-issue", err);
  } else if (
    errorMessage.includes("auth") ||
    errorMessage.includes("password")
  ) {
    // Authentication errors - these won't be fixed by reconnection
    redisEvents.emit("auth-failure", err);
    return; // Don't attempt reconnection for auth errors
  }

  /*
   * Reconnection strategy:
   * 1. Let built-in reconnectStrategy handle typical network errors
   * 2. Manual reconnection only when redis-js gives up (returns Error)
   * 3. Force reconnection for zombie connections detected by health checks
   */
  if (
    !isReconnecting &&
    !redisClient.isOpen &&
    reconnectAttempt >= RECONNECT_MAX_ATTEMPTS
  ) {
    connectionState = RedisConnectionState.RECONNECTING;
    redisEvents.emit("state-change", connectionState);
    handleReconnection();
  }
});

redisClient.on("connect", () => {
  // Reset reconnection state on successful connection
  isReconnecting = false;
  reconnectAttempt = 0;
  connectionState = RedisConnectionState.CONNECTED;
  redisEvents.emit("state-change", connectionState);
  redisEvents.emit("connected");

  // Start health check
  startHealthCheck();
});

redisClient.on("reconnecting", () => {
  // Update state and notify subscribers when Redis is attempting to reconnect
  connectionState = RedisConnectionState.RECONNECTING;
  redisEvents.emit("state-change", connectionState);
});

redisClient.on("end", () => {
  // Handle connection termination
  connectionState = RedisConnectionState.DISCONNECTED;
  redisEvents.emit("state-change", connectionState);

  // Stop health check when connection ends
  stopHealthCheck();
});

// Health check function to proactively detect connection issues
function startHealthCheck() {
  // Clear any existing timer
  stopHealthCheck();

  healthCheckTimer = setInterval(async () => {
    if (!redisClient.isOpen) {
      return; // Connection already closed, reconnection should be handled by events
    }

    try {
      // Simple ping to check connection
      await redisClient.ping();
    } catch (error) {
      // Emit event for health check failure so application can respond
      redisEvents.emit("health-check-failed", error);

      /*
       * Zombie connection detection:
       * When ping fails but connection is still marked as open,
       * we need to force reconnection to restore service
       */
      if (redisClient.isOpen && !isReconnecting) {
        // Force reconnection for zombie connection
        try {
          await redisClient.quit();
        } catch (quitError) {
          // Error during connection cleanup - continue with reconnection anyway
        }
        handleReconnection();
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// Manual reconnection handler for cases where automatic reconnection fails
async function handleReconnection() {
  if (isReconnecting) return;

  isReconnecting = true;
  reconnectAttempt = 0;
  connectionState = RedisConnectionState.RECONNECTING;
  redisEvents.emit("state-change", connectionState);

  while (reconnectAttempt < RECONNECT_MAX_ATTEMPTS && !redisClient.isOpen) {
    reconnectAttempt++;

    const delay = Math.min(
      RECONNECT_INITIAL_DELAY * Math.pow(2, reconnectAttempt - 1),
      RECONNECT_MAX_DELAY,
    );

    // Manual reconnection with exponential backoff

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
        // Successfully reconnected to Redis
        break;
      }
    } catch (error) {
      // Failed reconnection attempt - will retry with exponential backoff
    }
  }

  if (!redisClient.isOpen && reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
    // All reconnection attempts failed - update state and notify application
    connectionState = RedisConnectionState.FAILED;
    redisEvents.emit("state-change", connectionState);
    redisEvents.emit(
      "critical-failure",
      new Error("All manual reconnection attempts failed"),
    );
  }

  isReconnecting = false;
}

// Connect to Redis
const connectRedis = async () => {
  try {
    if (!redisClient.isOpen && !connecting) {
      connecting = true;
      connectionState = RedisConnectionState.CONNECTING;
      redisEvents.emit("state-change", connectionState);

      try {
        await redisClient.connect();
      } finally {
        connecting = false;
      }
    }
    return redisClient;
  } catch (error) {
    // Connection attempt failed - update state and initiate recovery

    // Update connection state
    connectionState = RedisConnectionState.RECONNECTING;
    redisEvents.emit("state-change", connectionState);
    redisEvents.emit("connection-failed", error);

    // Initiate reconnection process
    handleReconnection();
    throw error; // Re-throw to let callers know connection failed
  }
};

// Graceful shutdown helper
const closeRedis = async () => {
  // Stop health check before closing
  stopHealthCheck();

  if (redisClient.isOpen) {
    try {
      await redisClient.quit();
      // Connection closed successfully
      connectionState = RedisConnectionState.DISCONNECTED;
      redisEvents.emit("state-change", connectionState);
    } catch (error) {
      // Error during graceful shutdown - propagate to caller
      throw error;
    }
  }
};

// Get current connection state
const getRedisConnectionState = () => {
  return connectionState;
};

// Check if Redis is healthy (connected and responding)
const isRedisHealthy = async (): Promise<boolean> => {
  if (!redisClient.isOpen) {
    return false;
  }

  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    // Health check failed - connection is not usable
    return false;
  }
};

export {
  redisClient,
  connectRedis,
  closeRedis,
  getRedisConnectionState,
  isRedisHealthy,
  RedisConnectionState,
};
