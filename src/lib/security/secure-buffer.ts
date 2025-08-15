// SecureBuffer: wrapper for sensitive cryptographic material
// Provides automatic zeroing and lifecycle management

export class SecureBuffer {
  private _buf: Uint8Array;
  private _disposed: boolean = false;

  private constructor(bytes: Uint8Array) {
    // Store a private copy to avoid external references
    this._buf = new Uint8Array(bytes.length);
    this._buf.set(bytes);
  }

  static fromBytes(bytes: Uint8Array, zeroSource = false): SecureBuffer {
    const sb = new SecureBuffer(bytes);
    if (zeroSource) {
      try { bytes.fill(0); } catch {}
    }
    return sb;
  }

  static fromHex(hex: string): SecureBuffer {
    if (!hex || hex.length % 2 !== 0) throw new Error("Invalid hex input");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return new SecureBuffer(out);
  }

  get length(): number {
    this.assertActive();
    return this._buf.length;
  }

  // Return a new copy so callers can't mutate internal buffer
  toBytes(): Uint8Array {
    this.assertActive();
    const copy = new Uint8Array(this._buf.length);
    copy.set(this._buf);
    return copy;
  }

  // Provide hex string when needed for APIs that require it
  toHex(): string {
    this.assertActive();
    let hex = "";
    for (let i = 0; i < this._buf.length; i++) {
      hex += this._buf[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  // Constant-time equality
  equals(other: SecureBuffer): boolean {
    this.assertActive();
    other.assertActive();
    const a = this._buf;
    const b = other._buf;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  // Zero buffer and mark disposed
  dispose(): void {
    if (this._disposed) return;
    try { this._buf.fill(0); } catch {}
    // Replace with zero-length to drop reference
    this._buf = new Uint8Array(0);
    this._disposed = true;
  }

  // Prevent further use after dispose
  private assertActive() {
    if (this._disposed) throw new Error("SecureBuffer has been disposed");
  }
}

