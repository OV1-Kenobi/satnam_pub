# Bolt.new Prompt: Advanced Lightning Setup Options

## Overview

Enhance the existing 5-step registration process by adding **three independent advanced Lightning options** to Step 4. Users can choose any combination of these options:

1. **🏠 Self-Custodial Node**: Use their own Lightning node (vs hosted)
2. **🌐 Custom Domain**: Use their own domain (vs @satnam.pub)
3. **🏠🌐 Both Combined**: Maximum sovereignty setup

## Four Possible Combinations

### Option 1: Default (90% of users)

```
☁️ Hosted Lightning + @satnam.pub
Result: username@satnam.pub
```

### Option 2: Custom Domain Only

```
🌐 Hosted Lightning + Custom Domain
Result: username@your-domain.com
```

### Option 3: Self-Custodial Only

```
🏠 Self-Custodial Node + @satnam.pub
Result: username@satnam.pub
```

### Option 4: Full Advanced

```
🏠🌐 Self-Custodial Node + Custom Domain
Result: username@your-domain.com
```

## UI Design for Step 4: Lightning Setup

### Default View (Simple)

```html
<div class="lightning-setup-step">
  <h3>⚡ Lightning Setup</h3>

  <!-- Default Option (Always Visible) -->
  <div class="default-option selected">
    <div class="option-header">
      <input type="radio" name="lightning-setup" value="default" checked />
      <h4>☁️ Hosted Lightning (Recommended)</h4>
    </div>
    <div class="option-details">
      <p>Professional Lightning infrastructure managed by Satnam Academy</p>
      <div class="preview-address">
        <strong>Your Lightning Address: {{ username }}@satnam.pub</strong>
      </div>
      <ul class="features">
        <li>✅ Instant setup</li>
        <li>✅ Professional infrastructure</li>
        <li>✅ 24/7 monitoring</li>
        <li>✅ Automatic channel management</li>
      </ul>
    </div>
  </div>

  <!-- Advanced Options Toggle -->
  <div class="advanced-toggle">
    <button
      type="button"
      @click="showAdvanced = !showAdvanced"
      class="toggle-btn"
    >
      {{ showAdvanced ? '▼' : '▶' }} Advanced Options (Custom Node & Domain)
    </button>
  </div>
</div>
```

### Advanced View (When Expanded)

```html
<!-- Advanced Options Panel (Shows when toggled) -->
<div v-if="showAdvanced" class="advanced-options">
  <!-- Option 2: Custom Domain Only -->
  <div
    class="option-card"
    :class="{ selected: setupChoice === 'custom-domain' }"
  >
    <div class="option-header">
      <input
        type="radio"
        name="lightning-setup"
        value="custom-domain"
        v-model="setupChoice"
      />
      <h4>🌐 Custom Domain + Hosted Lightning</h4>
    </div>
    <div class="option-details">
      <p>Use your own domain with professional Lightning infrastructure</p>
      <div class="preview-address">
        <strong
          >Your Lightning Address: {{ username }}@{{ customDomain ||
          'your-domain.com' }}</strong
        >
      </div>
      <ul class="features">
        <li>✅ Your own branded domain</li>
        <li>✅ Professional Lightning management</li>
        <li>✅ Easy DNS setup</li>
      </ul>
    </div>
  </div>

  <!-- Option 3: Self-Custodial Only -->
  <div
    class="option-card"
    :class="{ selected: setupChoice === 'self-custodial' }"
  >
    <div class="option-header">
      <input
        type="radio"
        name="lightning-setup"
        value="self-custodial"
        v-model="setupChoice"
      />
      <h4>🏠 Self-Custodial Node</h4>
    </div>
    <div class="option-details">
      <p>Connect your own Lightning node with @satnam.pub domain</p>
      <div class="preview-address">
        <strong>Your Lightning Address: {{ username }}@satnam.pub</strong>
      </div>
      <ul class="features">
        <li>✅ Your own Lightning node</li>
        <li>✅ Maximum control & privacy</li>
        <li>✅ Self-custodial setup</li>
      </ul>
    </div>
  </div>

  <!-- Option 4: Full Advanced -->
  <div
    class="option-card"
    :class="{ selected: setupChoice === 'full-advanced' }"
  >
    <div class="option-header">
      <input
        type="radio"
        name="lightning-setup"
        value="full-advanced"
        v-model="setupChoice"
      />
      <h4>🏠🌐 Full Advanced Setup</h4>
    </div>
    <div class="option-details">
      <p>Your own Lightning node + Your own domain (Maximum sovereignty)</p>
      <div class="preview-address">
        <strong
          >Your Lightning Address: {{ username }}@{{ customDomain ||
          'your-domain.com' }}</strong
        >
      </div>
      <ul class="features">
        <li>✅ Complete self-sovereignty</li>
        <li>✅ Your own Lightning node</li>
        <li>✅ Your own domain</li>
        <li>✅ Maximum privacy & control</li>
      </ul>
    </div>
  </div>
</div>
```

### Configuration Forms (Conditional)

#### Custom Domain Configuration

```html
<!-- Shows for options 2 & 4 -->
<div v-if="needsCustomDomain" class="config-section">
  <h4>🌐 Domain Configuration</h4>
  <div class="form-group">
    <label>Your Domain</label>
    <input
      type="text"
      v-model="customDomain"
      placeholder="your-domain.com"
      @input="updatePreview"
      required
    />
    <small class="help-text">
      Enter your domain name (without https:// or www.)
    </small>
  </div>

  <div class="domain-help">
    <h5>📋 DNS Setup Required</h5>
    <p>After registration, you'll need to add these DNS records:</p>
    <code>
      TXT _lightning-address.your-domain.com "{{ username }}@satnam.pub"<br />
      TXT .well-known/lnurlp/{{ username }} "https://api.satnam.pub/lnurl/{{
      username }}"
    </code>
  </div>
</div>
```

#### Lightning Node Configuration

```html
<!-- Shows for options 3 & 4 -->
<div v-if="needsCustomNode" class="config-section">
  <h4>🏠 Lightning Node Configuration</h4>

  <div class="form-group">
    <label>Node Type</label>
    <select v-model="nodeConfig.nodeType" required>
      <option value="">Select Lightning Implementation</option>
      <option value="lnd">LND (Lightning Network Daemon)</option>
      <option value="cln">Core Lightning (CLN)</option>
      <option value="lnbits">LNBits Web Wallet</option>
      <option value="btcpay_hosted">BTCPay Server</option>
      <option value="eclair">Eclair (ACINQ)</option>
    </select>
  </div>

  <div class="form-group">
    <label>Connection URL</label>
    <input
      type="url"
      v-model="nodeConfig.connectionUrl"
      placeholder="https://your-node.domain.com:8080"
      required
    />
    <small class="help-text">Your Lightning node's API endpoint</small>
  </div>

  <div class="form-group">
    <label>Authentication Method</label>
    <select v-model="nodeConfig.authMethod" required>
      <option value="">Select Authentication</option>
      <option value="macaroon">Macaroon (LND/CLN)</option>
      <option value="api_key">API Key (LNBits/BTCPay)</option>
      <option value="certificate">Certificate</option>
    </select>
  </div>

  <!-- Conditional Credential Fields -->
  <div v-if="nodeConfig.authMethod === 'macaroon'" class="form-group">
    <label>Admin Macaroon</label>
    <textarea
      v-model="nodeConfig.credentials.macaroon"
      placeholder="Paste your admin macaroon (hex format)"
      rows="3"
      required
    ></textarea>
    <small class="help-text">Required permissions: read, write, invoices</small>
  </div>

  <div v-if="nodeConfig.authMethod === 'api_key'" class="form-group">
    <label>API Key</label>
    <input
      type="password"
      v-model="nodeConfig.credentials.apiKey"
      placeholder="Your API key"
      required
    />

    <!-- LNBits specific -->
    <div v-if="nodeConfig.nodeType === 'lnbits'" class="form-group">
      <label>LNBits Wallet ID</label>
      <input
        type="text"
        v-model="nodeConfig.credentials.walletId"
        placeholder="LNBits Wallet ID"
        required
      />
    </div>

    <!-- BTCPay specific -->
    <div v-if="nodeConfig.nodeType === 'btcpay_hosted'" class="form-group">
      <label>BTCPay Store ID</label>
      <input
        type="text"
        v-model="nodeConfig.credentials.storeId"
        placeholder="BTCPay Store ID"
        required
      />
    </div>
  </div>

  <!-- Network Selection -->
  <div class="form-group">
    <label class="checkbox-label">
      <input type="checkbox" v-model="nodeConfig.isTestnet" />
      Using Testnet (check if your node runs on testnet)
    </label>
  </div>

  <!-- Node Testing -->
  <div class="form-group">
    <button
      type="button"
      @click="testNodeConnection"
      :disabled="!canTestNode || isTesting"
      class="test-connection-btn"
    >
      {{ isTesting ? '🔄 Testing Connection...' : '🔍 Test Node Connection' }}
    </button>
  </div>

  <!-- Test Results -->
  <div v-if="testResult" class="test-results">
    <div v-if="testResult.success" class="result success">
      <h5>✅ Node Connection Successful!</h5>
      <ul>
        <li>
          <strong>Node:</strong> {{ testResult.verification.nodeInfo.alias }}
        </li>
        <li>
          <strong>Version:</strong> {{ testResult.verification.nodeInfo.version
          }}
        </li>
        <li>
          <strong>Network:</strong> {{ testResult.verification.nodeInfo.network
          }}
        </li>
        <li>
          <strong>Block Height:</strong> {{
          testResult.verification.nodeInfo.blockHeight }}
        </li>
      </ul>
      <div class="capabilities">
        <span
          v-if="testResult.verification.capabilities.canSend"
          class="capability"
          >📤 Send</span
        >
        <span
          v-if="testResult.verification.capabilities.canReceive"
          class="capability"
          >📥 Receive</span
        >
        <span
          v-if="testResult.verification.capabilities.hasInvoicing"
          class="capability"
          >🧾 Invoicing</span
        >
        <span
          v-if="testResult.verification.capabilities.hasLNURL"
          class="capability"
          >🔗 LNURL</span
        >
      </div>
    </div>

    <div v-else class="result error">
      <h5>❌ Connection Failed</h5>
      <p><strong>Error:</strong> {{ testResult.error }}</p>
      <div
        v-if="testResult.verification?.recommendations"
        class="recommendations"
      >
        <h6>💡 Recommendations:</h6>
        <ul>
          <li v-for="rec in testResult.verification.recommendations" :key="rec">
            {{ rec }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>
```

## JavaScript Data Structure

```javascript
export default {
  data() {
    return {
      // Basic registration data
      username: "",
      usernameChoice: "user_provided",
      userEncryptionKey: "",

      // Lightning setup state
      showAdvanced: false,
      setupChoice: "default", // 'default', 'custom-domain', 'self-custodial', 'full-advanced'

      // Custom domain configuration
      customDomain: "",

      // Lightning node configuration
      nodeConfig: {
        nodeType: "",
        connectionUrl: "",
        authMethod: "",
        credentials: {
          macaroon: "",
          apiKey: "",
          certificate: "",
          walletId: "",
          storeId: "",
        },
        isTestnet: false,
      },

      // Testing state
      testResult: null,
      isTesting: false,
    };
  },

  computed: {
    // Determine which configuration sections to show
    needsCustomDomain() {
      return (
        this.setupChoice === "custom-domain" ||
        this.setupChoice === "full-advanced"
      );
    },

    needsCustomNode() {
      return (
        this.setupChoice === "self-custodial" ||
        this.setupChoice === "full-advanced"
      );
    },

    // API payload flags
    useSelfCustodialNode() {
      return this.needsCustomNode;
    },

    useCustomDomain() {
      return this.needsCustomDomain;
    },

    // Validation
    canTestNode() {
      return (
        this.needsCustomNode &&
        this.nodeConfig.nodeType &&
        this.nodeConfig.connectionUrl &&
        this.nodeConfig.authMethod &&
        this.hasValidCredentials
      );
    },

    hasValidCredentials() {
      const { authMethod, credentials } = this.nodeConfig;

      if (authMethod === "macaroon") {
        return credentials.macaroon && credentials.macaroon.length > 0;
      }

      if (authMethod === "api_key") {
        const hasApiKey = credentials.apiKey && credentials.apiKey.length > 0;

        if (this.nodeConfig.nodeType === "lnbits") {
          return hasApiKey && credentials.walletId;
        }

        if (this.nodeConfig.nodeType === "btcpay_hosted") {
          return hasApiKey && credentials.storeId;
        }

        return hasApiKey;
      }

      return authMethod === "certificate";
    },

    // Final Lightning address preview
    finalLightningAddress() {
      const domain = this.useCustomDomain
        ? this.customDomain || "your-domain.com"
        : "satnam.pub";
      return `${this.username}@${domain}`;
    },

    // Setup description for confirmation
    setupDescription() {
      switch (this.setupChoice) {
        case "custom-domain":
          return "🌐 Hosted Lightning + Custom Domain";
        case "self-custodial":
          return "🏠 Self-Custodial Node + @satnam.pub";
        case "full-advanced":
          return "🏠🌐 Self-Custodial Node + Custom Domain";
        default:
          return "☁️ Hosted Lightning + @satnam.pub";
      }
    },
  },

  watch: {
    // Update preview when inputs change
    username() {
      this.updatePreview();
    },
    customDomain() {
      this.updatePreview();
    },
    setupChoice() {
      this.updatePreview();
    },
  },

  methods: {
    updatePreview() {
      // Real-time preview updates
      this.$emit("lightning-address-changed", this.finalLightningAddress);
    },

    async testNodeConnection() {
      if (!this.canTestNode) return;

      this.isTesting = true;
      this.testResult = null;

      try {
        const response = await fetch("/api/lightning/verify-node", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify(this.nodeConfig),
        });

        this.testResult = await response.json();

        if (this.testResult.success) {
          this.$toast.success("Node verified successfully!");
        } else {
          this.$toast.error(`Verification failed: ${this.testResult.error}`);
        }
      } catch (error) {
        this.testResult = {
          success: false,
          error: `Connection failed: ${error.message}`,
        };
        this.$toast.error("Failed to test node connection");
      } finally {
        this.isTesting = false;
      }
    },

    async submitRegistration() {
      // Build registration payload
      const payload = {
        username: this.username,
        usernameChoice: this.usernameChoice,
        userEncryptionKey: this.userEncryptionKey,

        // Independent Lightning options
        useSelfCustodialNode: this.useSelfCustodialNode,
        useCustomDomain: this.useCustomDomain,

        // Optional configurations
        ...(this.useCustomDomain && { customDomain: this.customDomain }),
        ...(this.useSelfCustodialNode && { customNodeConfig: this.nodeConfig }),

        // Other registration data...
        optionalData: {
          displayName: this.displayName,
          bio: this.bio,
        },
      };

      try {
        const response = await fetch("/api/identity/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (result.success) {
          this.$toast.success(
            `Registration complete! Your Lightning address: ${result.lightning_address}`,
          );
          this.$router.push("/dashboard");
        } else {
          throw new Error(result.error || "Registration failed");
        }
      } catch (error) {
        this.$toast.error(`Registration failed: ${error.message}`);
      }
    },

    // Helper method to check if step is complete
    isStepComplete() {
      // Basic validation
      if (!this.username) return false;

      // Custom domain validation
      if (this.useCustomDomain && !this.customDomain) return false;

      // Custom node validation
      if (this.useSelfCustodialNode) {
        if (!this.canTestNode) return false;
        if (!this.testResult || !this.testResult.success) return false;
      }

      return true;
    },
  },
};
```

## CSS Styling

```css
/* Lightning Setup Options */
.lightning-setup-step {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
}

.option-card {
  border: 2px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: white;
  transition: all 0.2s ease;
  cursor: pointer;
}

.option-card:hover {
  border-color: #f7931a;
  box-shadow: 0 2px 8px rgba(247, 147, 26, 0.1);
}

.option-card.selected {
  border-color: #f7931a;
  background: rgba(247, 147, 26, 0.05);
}

.option-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.option-header h4 {
  margin: 0;
  color: #333;
}

.preview-address {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  padding: 8px 12px;
  margin: 8px 0;
  font-family: "Courier New", monospace;
}

.features {
  list-style: none;
  padding: 0;
  margin: 8px 0 0 0;
}

.features li {
  padding: 2px 0;
  font-size: 14px;
  color: #666;
}

.advanced-toggle {
  margin-top: 20px;
  text-align: center;
}

.toggle-btn {
  background: none;
  border: 2px dashed #f7931a;
  color: #f7931a;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(247, 147, 26, 0.1);
}

.advanced-options {
  margin-top: 20px;
  padding: 20px;
  border: 2px dashed #f7931a;
  border-radius: 8px;
  background: rgba(247, 147, 26, 0.02);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.config-section {
  margin-top: 24px;
  padding: 16px;
  background: white;
  border-radius: 6px;
  border-left: 4px solid #f7931a;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  color: #333;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #f7931a;
  box-shadow: 0 0 0 2px rgba(247, 147, 26, 0.2);
}

.help-text {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.domain-help {
  margin-top: 12px;
  padding: 12px;
  background: #e3f2fd;
  border-radius: 4px;
  border-left: 4px solid #2196f3;
}

.domain-help code {
  display: block;
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-family: "Courier New", monospace;
  font-size: 12px;
  margin-top: 8px;
}

.test-connection-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.test-connection-btn:hover:not(:disabled) {
  background: #218838;
}

.test-connection-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.test-results {
  margin-top: 16px;
}

.result {
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid;
}

.result.success {
  background: #d4edda;
  border-left-color: #28a745;
  color: #155724;
}

.result.error {
  background: #f8d7da;
  border-left-color: #dc3545;
  color: #721c24;
}

.capabilities {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.capability {
  background: #28a745;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: auto !important;
  margin: 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  .option-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .capabilities {
    flex-direction: column;
    gap: 4px;
  }

  .advanced-options {
    padding: 16px;
  }
}
```

This implementation provides three clean, independent options that can be combined in any way, giving users maximum flexibility while maintaining the unified NIP-05/Lightning address system. The interface clearly shows all four possible combinations and guides users through the appropriate configuration steps for their chosen setup.
