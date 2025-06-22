import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// Import enhanced rate limiters
import {
  createDatabaseRateLimit,
  otpInitiateRateLimit,
  otpIPRateLimit,
  otpVerifyIPRateLimit,
  otpVerifyRateLimit,
} from "../lib/security/rate-limiter";

// Import authentication endpoints
import {
  addToFederationWhitelist,
  checkFederationWhitelist,
  getFederationWhitelist,
  removeFromFederationWhitelist,
} from "./auth/federation-whitelist";
import { nwcSignIn, verifyNWCConnection } from "./auth/nwc-signin";
import {
  getSession,
  initiateOTP,
  logout,
  refreshSession,
  validateSession,
  verifyOTP,
} from "./auth/otp-signin";

// Import existing endpoints
import { sendPayment } from "./payments/send";
import { getDualModePayments } from "./phoenixd/dual-mode-payments";
import { getFamilyChannels } from "./phoenixd/family-channels";
import { getLiquidityStatus } from "./phoenixd/liquidity";
import { getPhoenixdPayments } from "./phoenixd/payments";
import { getPhoenixdStatus } from "./phoenixd/status";

// Import individual wallet endpoints
import individualCashuBearer from "./individual/cashu/bearer";
import individualCashuWallet from "./individual/cashu/wallet";
import individualLightningWallet from "./individual/lightning/wallet";
import individualLightningZap from "./individual/lightning/zap";
import individualWallet from "./individual/wallet";

const app = express();

// Environment variable validation for production
if (process.env.NODE_ENV === "production") {
  if (!process.env.ALLOWED_ORIGINS) {
    console.warn(
      "⚠️  WARNING: ALLOWED_ORIGINS environment variable not set for production. Using fallback domain."
    );
  }
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'"], // Only if absolutely necessary
        styleSrc: ["'self'", "'unsafe-hashes'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "wss://your-domain.com",
          "ws://localhost:*",
          "wss://localhost:*",
        ],
      },
    },
  })
);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGINS?.split(",") || [
            "https://your-production-domain.com",
          ]
        : ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes",
  },
});

// Import crypto for privacy-preserving hashing
import crypto from "crypto";

/**
 * Create privacy-preserving hash for database rate limiting keys
 */
function hashDbRateLimitKey(data: string): string {
  if (!data || typeof data !== "string") {
    throw new Error("Invalid data provided for rate limit key hashing");
  }

  const salt =
    process.env.DB_RATE_LIMIT_SALT ||
    (() => {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "DB_RATE_LIMIT_SALT environment variable is required in production"
        );
      }
      console.warn(
        "⚠️ Using default salt for development. Set DB_RATE_LIMIT_SALT in production."
      );
      return "default-db-rate-limit-salt-change-in-production";
    })();

  const hash = crypto.createHash("sha256");
  hash.update(data + salt);
  return hash.digest("hex").substring(0, 32);
}

// Database-backed OTP rate limiters for persistent protection
const dbOtpInitiateLimit = createDatabaseRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 3,
  keyPrefix: "otp-initiate-db",
  keyGenerator: (req) => {
    const identifier = req.body?.npub || req.body?.pubkey || "unknown";
    return hashDbRateLimitKey(identifier);
  },
  message: "Too many OTP requests for this account. Database-enforced limit.",
  logViolations: true,
});

const dbOtpVerifyLimit = createDatabaseRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 15,
  keyPrefix: "otp-verify-db",
  keyGenerator: (req) => {
    const otpKey = req.body?.otpKey;
    const identifier = otpKey ? otpKey.split("_")[0] : "unknown";
    return hashDbRateLimitKey(identifier);
  },
  message:
    "Too many OTP verification attempts for this account. Database-enforced limit.",
  logViolations: true,
});

app.use(limiter);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Family Federation API",
  });
});

// Family Federation Authentication Routes
app.post("/api/auth/federation-whitelist", checkFederationWhitelist);
app.get("/api/auth/federation-whitelist", getFederationWhitelist);
app.post("/api/auth/federation-whitelist/add", addToFederationWhitelist);
app.delete(
  "/api/auth/federation-whitelist/:nip05",
  removeFromFederationWhitelist
);

// NWC Authentication Routes
app.post("/api/auth/nwc-signin", authLimiter, nwcSignIn);
app.post("/api/auth/nwc-verify", authLimiter, verifyNWCConnection);

// OTP Authentication Routes with enhanced rate limiting
app.post(
  "/api/auth/otp/initiate",
  authLimiter, // Basic IP-based auth limiting
  otpInitiateRateLimit, // User-specific OTP initiate limiting
  otpIPRateLimit, // IP-based OTP limiting
  dbOtpInitiateLimit, // Database-backed persistent limiting
  initiateOTP
);

app.post(
  "/api/auth/otp/verify",
  authLimiter, // Basic IP-based auth limiting
  otpVerifyRateLimit, // User-specific OTP verify limiting
  otpVerifyIPRateLimit, // IP-based OTP verify limiting
  dbOtpVerifyLimit, // Database-backed persistent limiting
  verifyOTP
);

// Session Management Routes
app.get("/api/auth/session", getSession);
app.post("/api/auth/validate-session", validateSession);
app.post("/api/auth/refresh", refreshSession);
app.post("/api/auth/logout", logout);

// Payment Routes (existing)
app.post("/api/payments/send", sendPayment);

// PhoenixD Routes (existing)
app.get("/api/phoenixd/status", getPhoenixdStatus);
app.get("/api/phoenixd/payments", getPhoenixdPayments);
app.get("/api/phoenixd/liquidity", getLiquidityStatus);
app.get("/api/phoenixd/family-channels", getFamilyChannels);
app.get("/api/phoenixd/dual-mode-payments", getDualModePayments);

// Individual Wallet Routes
app.get("/api/individual/wallet", individualWallet);
app.get("/api/individual/lightning/wallet", individualLightningWallet);
app.post("/api/individual/lightning/zap", individualLightningZap);
app.get("/api/individual/cashu/wallet", individualCashuWallet);
app.post("/api/individual/cashu/bearer", individualCashuBearer);

// Error handling middleware
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("API Error:", error);

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === "development";

    res.status(error.status || 500).json({
      success: false,
      error: isDevelopment ? error.message : "Internal server error",
      ...(isDevelopment && { stack: error.stack }),
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    meta: {
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    },
  });
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🚀 Family Federation API server running on port ${PORT}`);
  console.log(`🔐 Authentication endpoints available:`);
  console.log(`   POST /api/auth/nwc-signin - NWC Authentication`);
  console.log(`   POST /api/auth/otp/initiate - OTP Initiation`);
  console.log(`   POST /api/auth/otp/verify - OTP Verification`);
  console.log(`   POST /api/auth/federation-whitelist - Check Whitelist`);
  console.log(`💰 Individual Wallet endpoints available:`);
  console.log(`   GET  /api/individual/wallet - Main wallet data`);
  console.log(`   GET  /api/individual/lightning/wallet - Lightning data`);
  console.log(`   POST /api/individual/lightning/zap - Send Lightning zap`);
  console.log(`   GET  /api/individual/cashu/wallet - Cashu data`);
  console.log(`   POST /api/individual/cashu/bearer - Create bearer note`);
  console.log(`🛡️  Security: Rate limiting and CORS enabled`);
});

export default app;
