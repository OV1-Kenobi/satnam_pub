# Individual Wallet API Reference

## 🏛️ Individual Wallet Sovereignty Principle

The Individual Wallet API enforces the **Individual Wallet Sovereignty Principle** - a core architectural principle ensuring that Adults, Stewards, and Guardians have complete autonomy over their individual wallets while maintaining appropriate family coordination capabilities.

## 📚 Complete API Documentation

**For comprehensive API documentation, see:**

**[`api/individual/README.md`](../api/individual/README.md)**

This detailed documentation includes:

### 🔧 API Endpoints
- **Individual Wallet Management** (`/api/individual/wallet`)
- **Lightning Network Integration** (`/api/individual/lightning/*`)
- **Cashu eCash Operations** (`/api/individual/cashu/*`)
- **Cross-Mint Operations** (`/api/individual/cross-mint/*`)

### 🏛️ Sovereignty Compliance
- **Master Context Compliance** with comprehensive test coverage
- **Individual Wallet Sovereignty Principle** enforcement
- **Role-based authorization** (Private, Offspring, Adult, Steward, Guardian)
- **Parent-offspring authorization** relationship handling

### 🌉 eCash Bridge Integration
- **Fedimint↔Cashu conversion** with atomic operations
- **Multi-protocol support** (Fedimint, Cashu, Satnam Mint)
- **Privacy-preserving cross-mint operations**
- **Sovereignty-compliant spending limits**

### 🧪 Test Coverage
- **Comprehensive sovereignty validation** in [`api/__tests__/api-endpoints.test.js`](../api/__tests__/api-endpoints.test.js)
- **Cross-mint operations testing** with eCash bridge compliance
- **Privacy-first architecture validation**
- **System integration compatibility testing**

## 🚀 Quick Start

### Authentication
All endpoints require JWT authentication with proper role validation.

### Sovereignty Principles
- **Adults/Stewards/Guardians**: Unlimited individual wallet operations (`-1` values)
- **Offspring**: Subject to spending limits and parent approval requirements
- **Private**: Full autonomy over individual wallet operations

### Example Usage

```bash
# Get individual wallet data
curl -H "Authorization: Bearer <jwt_token>" \
  "https://satnam.pub/api/individual/wallet?memberId=user123"

# Create cross-mint payment (sovereign roles)
curl -X POST -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"memberId":"user123","amount":100000,"recipient":"npub1...","userRole":"adult"}' \
  "https://satnam.pub/api/individual/cross-mint/multi-nut-payment"
```

## 🔗 Related Documentation

### System Documentation
- **[Lightning Addresses](LIGHTNING_ADDRESSES.md)** - Lightning Address integration patterns
- **[Privacy Protection](PRIVACY-PROTECTION.md)** - Privacy-first architecture
- **[Master Context](../.zencoder/rules/MASTER_CONTEXT.md)** - Sovereignty principle documentation

### API Documentation
- **[Cross-Mint API](../api/individual/cross-mint/README.md)** - Detailed cross-mint endpoint specifications
- **[Federation API](../api/federation/README.md)** - Family Federation governance endpoints
- **[Allowance Automation API](API_ALLOWANCE_AUTOMATION.md)** - Family allowance management

### Development Resources
- **[Setup Guide](SETUP-GUIDE.md)** - Development environment setup
- **[Security Guidelines](PRIVACY_FIRST_SECURITY.md)** - Security best practices
- **[Test Coverage](../api/__tests__/api-endpoints.test.js)** - Comprehensive API testing

## 🎯 Target Audiences

### Internal Developers
- API implementation details and sovereignty compliance patterns
- Test coverage and Master Context validation
- Cross-mint integration and eCash bridge functionality

### External API Consumers
- Lightning Address service integration
- Wallet developers building on Individual Wallet API
- System integrators requiring sovereignty-compliant wallet operations

### System Integrators
- Family Federation architecture integration
- Multi-protocol eCash operations (Fedimint, Cashu, Satnam)
- Privacy-first wallet management patterns

---

**For complete technical specifications, implementation details, and sovereignty compliance documentation, see the comprehensive API documentation at [`api/individual/README.md`](../api/individual/README.md).**

---

**Last Updated**: January 2025  
**API Version**: 1.0.0  
**Master Context Compliance**: ✅ 100% Compliant  
**Sovereignty Principle**: ✅ Fully Enforced

---

_Individual Wallet Sovereignty: Empowering financial autonomy while preserving family coordination_
