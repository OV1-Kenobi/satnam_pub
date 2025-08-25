# Subresource Integrity (SRI) Protection

## Overview

Subresource Integrity (SRI) is a security feature that enables browsers to verify that resources they fetch are delivered without unexpected manipulation. This document provides guidelines for implementing SRI protection in the Satnam.pub application.

## Current Status

✅ **No External Scripts Currently Used**: The application uses Vite bundling and all dependencies are bundled locally, eliminating the need for external CDN scripts.

✅ **CSP Hardened**: Content Security Policy has been configured to only allow `'self'` for script sources, preventing unauthorized external script execution.

## SRI Implementation Guidelines

### When to Use SRI

Implement SRI protection when:
- Loading JavaScript libraries from external CDNs
- Including external stylesheets
- Loading any external resources that could be tampered with

### SRI Hash Generation

Generate SRI hashes using one of these methods:

#### Method 1: Using OpenSSL
```bash
# For JavaScript files
curl -s https://unpkg.com/library@version/dist/library.min.js | openssl dgst -sha384 -binary | openssl base64 -A

# For CSS files
curl -s https://cdn.jsdelivr.net/npm/library@version/dist/library.min.css | openssl dgst -sha384 -binary | openssl base64 -A
```

#### Method 2: Using Node.js
```javascript
const crypto = require('crypto');
const fs = require('fs');

function generateSRIHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha384');
  hashSum.update(fileBuffer);
  return `sha384-${hashSum.digest('base64')}`;
}
```

#### Method 3: Online SRI Generator
Use https://www.srihash.org/ for quick hash generation.

### Implementation Examples

#### JavaScript Libraries
```html
<!-- Example: Loading a hypothetical external library -->
<script src="https://unpkg.com/library@1.0.0/dist/library.min.js"
        integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
        crossorigin="anonymous"></script>
```

#### CSS Libraries
```html
<!-- Example: Loading external CSS -->
<link rel="stylesheet" 
      href="https://cdn.jsdelivr.net/npm/library@1.0.0/dist/library.min.css"
      integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3"
      crossorigin="anonymous">
```

### CSP Integration

When adding external scripts with SRI, update the CSP in `netlify.toml`:

```toml
# Add specific domains to script-src when needed
Content-Security-Policy = "default-src 'self'; script-src 'self' https://unpkg.com https://cdn.jsdelivr.net; ..."
```

### Security Best Practices

1. **Use SHA-384 or SHA-512**: These provide better security than SHA-256
2. **Always include crossorigin="anonymous"**: Required for SRI to work with CORS
3. **Verify hashes regularly**: Update hashes when library versions change
4. **Use specific versions**: Avoid using `@latest` or floating versions
5. **Test thoroughly**: Ensure all functionality works after adding SRI

### Automated SRI Management

For future development, consider implementing automated SRI hash management:

```javascript
// scripts/update-sri-hashes.js
const crypto = require('crypto');
const https = require('https');

async function updateSRIHashes(dependencies) {
  for (const dep of dependencies) {
    const response = await fetch(dep.url);
    const content = await response.text();
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    console.log(`${dep.name}: sha384-${hash}`);
  }
}
```

### Monitoring and Maintenance

1. **Regular Updates**: Check for library updates monthly
2. **Hash Verification**: Verify hashes haven't changed unexpectedly
3. **Security Alerts**: Monitor security advisories for used libraries
4. **Fallback Strategy**: Have local fallbacks for critical external resources

## Current Security Posture

The Satnam.pub application currently has **maximum SRI security** because:

✅ **No External Dependencies**: All scripts are bundled locally via Vite
✅ **Strict CSP**: Only allows `'self'` for script sources
✅ **Local Font Loading**: Google Fonts are the only external resource (CSS only)
✅ **Bundled Crypto Libraries**: All cryptographic libraries are bundled locally

This approach provides better security than SRI because there are no external attack vectors for script injection.

## Future Considerations

If external scripts become necessary:

1. **Evaluate Alternatives**: Consider bundling locally instead
2. **Implement SRI**: Use the guidelines above
3. **Update CSP**: Add specific domains to allowlist
4. **Monitor Changes**: Set up automated hash verification
5. **Test Thoroughly**: Ensure no functionality breaks

## Emergency Procedures

If an external script is compromised:

1. **Immediate Response**: Remove the script from CSP allowlist
2. **Local Fallback**: Switch to bundled version if available
3. **Hash Update**: Generate new SRI hash for clean version
4. **Security Review**: Audit all external dependencies
5. **Incident Report**: Document the compromise and response

---

**Security Note**: The current architecture with local bundling provides superior security to SRI-protected external scripts. Maintain this approach whenever possible.
