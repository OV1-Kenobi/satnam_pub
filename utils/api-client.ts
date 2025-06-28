export class ApiClient {
  private baseUrl: string;

  constructor() {
    // Use current domain for API calls to your backend API
    this.baseUrl = window.location.origin + "/api";
  }

  // Authentication methods
  async authenticateUser(credentials: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/auth/otp-signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }
    return response.json();
  }

  async registerIdentity(identityData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/auth/register-identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identityData),
    });
    if (!response.ok) {
      throw new Error(`Identity registration failed: ${response.statusText}`);
    }
    return response.json();
  }

  async initiateOtp(otpData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/auth/otp-initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(otpData),
    });
    if (!response.ok) {
      throw new Error(`OTP initiation failed: ${response.statusText}`);
    }
    return response.json();
  }

  async verifyOtp(verificationData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/auth/otp-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verificationData),
    });
    if (!response.ok) {
      throw new Error(`OTP verification failed: ${response.statusText}`);
    }
    return response.json();
  }

  // User data management
  async storeUserData(userData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/endpoints/user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      throw new Error(`User data storage failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Communications
  async sendGiftwrappedMessage(messageData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/communications/giftwrapped`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageData),
    });
    if (!response.ok) {
      throw new Error(`Message sending failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Health check
  async checkHealth(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Family operations
  async getFamilyMembers(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/family/members`);
    if (!response.ok) {
      throw new Error(`Failed to fetch family members: ${response.statusText}`);
    }
    return response.json();
  }

  // Lightning operations
  async getLightningStatus(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/lightning/status`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch lightning status: ${response.statusText}`
      );
    }
    return response.json();
  }

  // Payment operations
  async sendPayment(paymentData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/payments/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentData),
    });
    if (!response.ok) {
      throw new Error(`Payment failed: ${response.statusText}`);
    }
    return response.json();
  }
}
