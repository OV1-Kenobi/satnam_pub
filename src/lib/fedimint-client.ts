// Browser-compatible Fedimint client for Bolt.new
export class BrowserFedimintClient {
  constructor(config) {
    this.config = config;
    this.connected = false;
    this.balance = 0;
    this.notes = new Map();
    this.events = {};
  }

  // Simple event system
  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => callback(...args));
    }
  }

  // Web Crypto API for random generation
  generateId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  async connect() {
    try {
      console.log(`Connecting to federation ${this.config.federationId}`);

      // Simulate connection with fetch API
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.connected = true;
      this.balance = Math.floor(Math.random() * 100000); // Mock balance

      this.emit("connected", {
        federationId: this.config.federationId,
        guardianCount: this.config.totalGuardians,
        threshold: this.config.threshold,
      });

      return true;
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  async getBalance() {
    if (!this.connected) throw new Error("Not connected to federation");
    return this.balance;
  }

  async issueECash(amount) {
    if (!this.connected) throw new Error("Not connected to federation");
    if (amount > this.balance) throw new Error("Insufficient balance");

    const notes = [];
    const denominations = [10000, 5000, 1000, 1, 2, 3];
    let remaining = amount;

    for (const denom of denominations) {
      while (remaining >= denom) {
        const note = {
          amount: denom,
          noteId: this.generateId(),
          spendKey: this.generateId(),
          denomination: denom,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        };

        notes.push(note);
        this.notes.set(note.noteId, note);
        remaining -= denom;
      }
    }

    this.balance -= amount;
    this.emit("ecash-issued", { amount, noteCount: notes.length });
    return notes;
  }

  async createLightningInvoice(amount, description) {
    if (!this.connected) throw new Error("Not connected to federation");

    // Mock Lightning invoice
    const mockInvoice = `lnbc${amount}u1p${this.generateId()}`;
    this.emit("invoice-created", { amount, invoice: mockInvoice, description });
    return mockInvoice;
  }

  async payLightningInvoice(invoice) {
    if (!this.connected) throw new Error("Not connected to federation");

    // Extract amount from mock invoice
    const amount = 1000; // Mock amount
    if (amount > this.balance) throw new Error("Insufficient balance");

    this.balance -= amount;
    const paymentHash = this.generateId();
    this.emit("lightning-payment", { amount, paymentHash, invoice });
    return paymentHash;
  }

  isConnected() {
    return this.connected;
  }

  disconnect() {
    this.connected = false;
    this.emit("disconnected", { federationId: this.config.federationId });
  }
}
