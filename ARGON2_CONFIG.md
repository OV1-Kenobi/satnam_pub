# Argon2 Configuration Guide

## Overview

The security module now uses configurable Argon2 parameters to prevent out-of-memory (OOM) errors while maintaining strong security. The previous hardcoded 256MB memory cost was too high for most production servers.

## Environment Variables

| Variable             | Default | Description          | Memory Usage |
| -------------------- | ------- | -------------------- | ------------ |
| `ARGON2_MEMORY_COST` | `16`    | Log2 of memory usage | 64MB         |
| `ARGON2_TIME_COST`   | `3`     | Number of iterations | -            |
| `ARGON2_PARALLELISM` | `1`     | Number of threads    | -            |

## Memory Usage Reference

| ARGON2_MEMORY_COST | Memory Usage | Recommendation                     |
| ------------------ | ------------ | ---------------------------------- |
| 15                 | 32MB         | Development/testing only           |
| 16                 | 64MB         | **Production safe default**        |
| 17                 | 128MB        | Good balance for production        |
| 18                 | 256MB        | High security, monitor for OOM     |
| 19+                | 512MB+       | Dedicated high-memory servers only |

## Configuration Validation

Use the built-in validation functions to check your configuration:

```typescript
import { getArgon2Config, validateArgon2ConfigOnStartup } from "./lib/security";

// Validate configuration on server startup
validateArgon2ConfigOnStartup();

// Get detailed configuration info
const { config, memoryUsageMB, warnings, recommendations } = getArgon2Config();
console.log(`Current memory usage: ${memoryUsageMB}MB`);
```

## Production Deployment Guide

### Step 1: Start Conservative

```bash
# Safe defaults for most production servers
ARGON2_MEMORY_COST=16  # 64MB
ARGON2_TIME_COST=3     # 3 iterations
ARGON2_PARALLELISM=1   # Single thread
```

### Step 2: Monitor and Scale

```bash
# Monitor memory usage under load
# If stable, consider increasing security:
ARGON2_MEMORY_COST=17  # 128MB

# For high-security applications with dedicated resources:
ARGON2_MEMORY_COST=18  # 256MB (monitor closely!)
```

### Step 3: Load Testing

- Always load test before deploying higher memory costs
- Monitor for OOM errors, process restarts, and performance degradation
- Consider horizontal scaling instead of increasing memory cost

## Environment-Specific Recommendations

### Development

```bash
ARGON2_MEMORY_COST=15  # 32MB for faster testing
ARGON2_TIME_COST=2     # Minimum secure iterations
```

### Staging

```bash
ARGON2_MEMORY_COST=16  # Match production baseline
ARGON2_TIME_COST=3     # Production settings
```

### Production (Light Load)

```bash
ARGON2_MEMORY_COST=17  # 128MB if resources allow
ARGON2_TIME_COST=3     # Balanced performance
```

### Production (Heavy Load)

```bash
ARGON2_MEMORY_COST=16  # 64MB safe default
ARGON2_TIME_COST=3     # Consider reducing to 2 if needed
```

### High Security (Dedicated Servers)

```bash
ARGON2_MEMORY_COST=18  # 256MB with extensive monitoring
ARGON2_TIME_COST=4     # Higher time cost for security
```

## Migration Guide

If upgrading from the previous hardcoded 256MB configuration:

1. **Add environment variables** to your deployment configuration
2. **Start with safe defaults** (64MB) to prevent OOM errors
3. **Test thoroughly** before increasing memory usage
4. **Monitor memory usage** in production
5. **Scale gradually** based on your server's capabilities

## Troubleshooting

### OOM Errors

- Reduce `ARGON2_MEMORY_COST` by 1 (halves memory usage)
- Consider horizontal scaling instead of higher memory costs

### Performance Issues

- Reduce `ARGON2_TIME_COST` (fewer iterations)
- Monitor CPU usage during key derivation operations

### Security Concerns

- Never go below `ARGON2_MEMORY_COST=15` in production
- Minimum `ARGON2_TIME_COST=2` for security
- Use `getArgon2Config()` to validate your settings

## Security Impact

The new defaults (64MB, 3 iterations) provide:

- **Strong protection** against GPU/ASIC attacks
- **Production stability** without OOM risks
- **Configurable security** based on your infrastructure
- **Gradual scaling** as your resources grow

This is a significant improvement over the fixed 256MB configuration that could crash servers under load.
