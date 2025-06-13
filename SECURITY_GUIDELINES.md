# 🔐 Security Guidelines for Identity Forge

## Step 5: Security Guidelines for Your Rebuilding Camelot Account

### For Safely Inputting Your nsec:

#### 1) Environment Setup:

- ✅ **HTTPS Only**: Never enter nsec on HTTP websites
- ✅ **Private Browsing**: Use incognito/private mode
- ✅ **Trusted Networks**: Avoid public WiFi for nsec operations
- ✅ **Updated Browser**: Use latest browser version
- ❌ **Shared Computers**: Never use nsec on shared/public computers

#### 2) Browser Security:

- **🔒 Extensions**: Consider using Nostr browser extensions (nos2x, Alby)
- **🧹 Clear Data**: Always clear browser data after nsec use
- **🚫 No Screenshots**: Never screenshot or save nsec in files
- **👁️ Check URL**: Verify you're on the correct domain
- **🔍 Network Inspection**: Advanced users can check Network tab for data leaks

#### 3) Code Safety:

- **📱 Mobile Apps**: Prefer dedicated Nostr mobile apps when possible
- **🔐 Hardware Signing**: Use hardware wallets/devices when available
- **🔑 Key Management**: Consider using key management solutions
- **📋 Backup Strategy**: Secure offline backups of your nsec

## NWC (Nostr Wallet Connect) Security

### URI Validation:

- ✅ Format: `nostr+walletconnect://pubkey?relay=wss://...&secret=...`
- ✅ Verify pubkey is 64-character hex
- ✅ Ensure relay uses WSS (secure WebSocket)
- ✅ Secret should be cryptographically secure
- ❌ Never share NWC URIs publicly

### Connection Security:

- **🔒 Permissions**: Only grant necessary permissions
- **⏰ Time Limits**: Set connection expiration if supported
- **📱 Wallet Apps**: Use established wallet apps (Mutiny, Alby, etc.)
- **🔍 Monitor**: Regularly check active connections

## OTP (One-Time Password) Security

### DM Security:

- **📱 Client Check**: Verify OTP in your trusted Nostr client
- **⏰ Time Limits**: OTP expires in 10 minutes
- **🔢 Single Use**: Each OTP can only be used once
- **🚨 Suspicious Activity**: Report unexpected OTP requests

### Best Practices:

- **📱 Multiple Clients**: Check DMs across different clients if needed
- **🔍 Verify Sender**: Confirm OTP comes from legitimate source
- **🚫 Never Share**: Don't share OTP codes with anyone
- **⚠️ Phishing**: Be aware of fake OTP requests

## General Authentication Security

### Session Management:

- **⏰ Auto Logout**: Sessions automatically expire
- **🔒 Secure Tokens**: All tokens are cryptographically signed
- **📱 Device Isolation**: Each device maintains separate sessions
- **🚪 Manual Logout**: Always logout when done

### Data Protection:

- **🔐 Encryption**: All sensitive data encrypted at rest
- **🌐 TLS**: All communications use TLS/HTTPS
- **🗂️ Minimal Storage**: Only necessary data is stored
- **🧹 Regular Cleanup**: Inactive sessions are purged

## Red Flags - Stop Immediately If:

### 🚨 **Critical Security Warnings**:

- Site asks for nsec over HTTP
- Unexpected OTP requests in DMs
- NWC connections you didn't create
- Suspicious wallet activity
- Requests for seed phrases on websites
- Phishing attempts mimicking Identity Forge

### 🔒 **Secure Alternatives**:

- Use browser extensions instead of direct nsec entry
- Prefer OTP via DM over direct key entry
- Use NWC from trusted wallet apps
- Enable 2FA where available
- Use hardware signing devices

## Emergency Procedures

### If Your Key is Compromised:

1. **🚨 Immediate**: Stop using the compromised key
2. **📱 Generate New**: Create new Nostr keypair immediately
3. **📢 Announce**: Post key rotation announcement from new key
4. **🔄 Migrate**: Update all services to new pubkey
5. **🗑️ Revoke**: Revoke old key if platform supports it

### If Suspicious Activity:

1. **🚪 Logout**: Immediately logout from all sessions
2. **🔍 Check**: Review recent activity and connections
3. **📱 Verify**: Check your Nostr clients for unexpected messages
4. **🔐 Rotate**: Consider rotating keys as precaution
5. **📞 Report**: Contact support if needed

## Implementation Checklist for Developers

### ✅ **Completed**:

- [x] HTTPS enforcement
- [x] Input validation for all auth methods
- [x] Proper error handling without data leakage
- [x] Session timeout implementation
- [x] Secure token generation

### 🔄 **In Progress**:

- [ ] Enhanced NWC URI validation
- [ ] Nsec security warnings
- [ ] Browser security checks
- [ ] Rate limiting for auth attempts

### 📋 **Planned**:

- [ ] CSP headers implementation
- [ ] Audit logging
- [ ] Automated security scanning
- [ ] Penetration testing
- [ ] Security documentation review

---

**Remember**: Your nsec is your digital identity. Treat it with the same security as your bank password or more. When in doubt, use more secure methods like browser extensions or hardware devices.
