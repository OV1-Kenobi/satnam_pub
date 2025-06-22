// lib/server.ts
// Load environment variables first
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import apiRoutes from "./api/routes";

// GOLD STANDARD SECURITY: Import startup validation
import {
  validateArgon2Usage,
  validateSecurityOnStartup,
} from "./startup-validator";

const app = express();
const PORT = process.env.PORT || 8000;

// ===========================================
// MIDDLEWARE SETUP
// ===========================================

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "wss:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS setup
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://yourdomain.com"] // Replace with your domain
        : [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://localhost:5173",
          ], // Dev origins
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Rate limiting - Relaxed for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 100 : 1000, // Higher limit for dev
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Stricter rate limiting for auth endpoints - Relaxed for development
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 10 : 100, // Much higher limit for dev
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later",
  },
});

app.use("/api/auth/", authLimiter);

// Cookie parsing (required for secure session management)
app.use(cookieParser());

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ===========================================
// ROUTES
// ===========================================

// API routes
app.use("/api", apiRoutes);

// Health check - also available at root for direct backend access
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Identity Forge API is healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.originalUrl,
  });
});

// Error handler
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Server Error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error",
      ...(process.env.NODE_ENV === "development" && { details: error.message }),
    });
  }
);

// ===========================================
// SERVER STARTUP WITH GOLD STANDARD SECURITY VALIDATION
// ===========================================

async function startServer() {
  try {
    // CRITICAL FIX: Validate all security configurations before starting
    console.log("🔐 GOLD STANDARD SECURITY VALIDATION STARTING...\n");

    // 1. Validate Argon2 parameters are being used (fixes the original issue)
    const argon2Valid = await validateArgon2Usage();
    if (!argon2Valid) {
      console.error(
        "❌ Argon2 validation failed - this was the critical issue identified"
      );
      if (process.env.NODE_ENV === "production") {
        process.exit(1);
      }
    }

    // 2. Run comprehensive security validation
    const securityValid = await validateSecurityOnStartup({
      enforceGoldStandard: true,
      exitOnFailure: process.env.NODE_ENV === "production",
      logLevel: "detailed",
      validateEnvironment: true,
    });

    if (!securityValid) {
      console.warn("⚠️  Security validation found issues - review above");
      if (process.env.NODE_ENV === "production") {
        console.error("❌ Production startup blocked due to security issues");
        process.exit(1);
      }
    }

    console.log("✅ GOLD STANDARD SECURITY VALIDATION COMPLETE\n");

    // Start the server only after security validation passes
    app.listen(PORT, () => {
      console.log("═".repeat(60));
      console.log("🚀 IDENTITY FORGE API SERVER - GOLD STANDARD SECURITY");
      console.log("═".repeat(60));
      console.log(`🌐 Server: http://localhost:${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth: http://localhost:${PORT}/api/auth/*`);
      console.log(`👤 Identity: http://localhost:${PORT}/api/identity/*`);
      console.log(`🌊 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔒 Security: GOLD STANDARD ARGON2ID + AES-256-GCM`);
      console.log("═".repeat(60));
      console.log("✅ Ready to serve high-tech users with maximum security");
    });
  } catch (error) {
    console.error(
      "💥 CRITICAL: Server startup failed during security validation"
    );
    console.error("Error:", error);

    if (process.env.NODE_ENV === "production") {
      console.error("❌ Production startup aborted - fix security issues");
      process.exit(1);
    } else {
      console.warn(
        "⚠️  Development mode - starting anyway, but fix these issues!"
      );

      // Start server in development even with security warnings
      app.listen(PORT, () => {
        console.log(
          `🛠 Development server running on port ${PORT} with security warnings`
        );
      });
    }
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully");
  process.exit(0);
});

export { app, startServer };

// Start server if this file is run directly
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
  startServer();
}
