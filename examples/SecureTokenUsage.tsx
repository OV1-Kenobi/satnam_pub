/**
 * @fileoverview Example usage of Secure Token Management
 * @description Shows how to integrate secure token storage with your React application
 */

import { useFederatedSigning } from "../hooks/useFederatedSigning";
import {
    SecureTokenProvider,
    useSecureToken,
} from "../hooks/useSecureTokenStorage";

// Configure your token endpoints
const tokenConfig = {
  tokenEndpoint: "/api/auth/token",
  refreshEndpoint: "/api/auth/refresh",
  revokeEndpoint: "/api/auth/revoke",
  refreshThresholdMinutes: 5, // Refresh token when it expires in 5 minutes
  maxRetries: 3,
  autoCleanup: true,
};

/**
 * Example component showing secure token usage
 */
function SecureTokenExample() {
  const {
    getToken,
    setTokens,
    clearTokens,
    isAuthenticated,
    loading,
    error,
    isTokenExpired,
    getTokenExpirationTime,
  } = useSecureToken();

  const federatedSigning = useFederatedSigning();

  const handleLogin = async (credentials: {
    email: string;
    password: string;
  }) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      const tokenData = await response.json();

      // Store tokens securely
      await setTokens({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
        tokenType: tokenData.token_type || "Bearer",
        scope: tokenData.scope,
      });

      // User is now logged in - update UI state
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleLogout = async () => {
    await clearTokens();
    // User is now logged out - update UI state
  };

  const handleCreateEvent = async () => {
    if (!isAuthenticated) {
      // Show authentication required message to user
      return;
    }

    // The federated signing hook will automatically use secure token storage
    const result = await federatedSigning.createEvent({
      familyId: "family-123",
      eventType: "family_announcement",
      content: "Monthly family meeting scheduled",
      requiredSigners: ["member1", "member2", "member3"],
    });

    if (result.success) {
      // Event created successfully - update UI
      // result.data contains the event details
    } else {
      // Handle event creation error
      // result.error contains error details
    }
  };

  const expirationTime = getTokenExpirationTime();
  const timeUntilExpiry = expirationTime ? expirationTime - Date.now() : 0;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        Secure Token Management Example
      </h1>

      {/* Authentication Status */}
      <div className="mb-6 p-4 border rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Authentication Status</h2>
        <div className="space-y-2">
          <p>
            <span className="font-medium">Status:</span>{" "}
            <span
              className={isAuthenticated ? "text-green-600" : "text-red-600"}
            >
              {isAuthenticated ? "Authenticated" : "Not authenticated"}
            </span>
          </p>

          {isAuthenticated && (
            <>
              <p>
                <span className="font-medium">Token Expired:</span>{" "}
                <span
                  className={
                    isTokenExpired() ? "text-red-600" : "text-green-600"
                  }
                >
                  {isTokenExpired() ? "Yes" : "No"}
                </span>
              </p>

              {timeUntilExpiry > 0 && (
                <p>
                  <span className="font-medium">Time until expiry:</span>{" "}
                  {Math.round(timeUntilExpiry / 60000)} minutes
                </p>
              )}
            </>
          )}

          {loading && <p className="text-blue-600">Loading...</p>}

          {error && <p className="text-red-600">Error: {error}</p>}
        </div>
      </div>

      {/* Login Form */}
      {!isAuthenticated && (
        <div className="mb-6 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4">Login</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleLogin({
                email: formData.get("email") as string,
                password: formData.get("password") as string,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      )}

      {/* Actions */}
      {isAuthenticated && (
        <div className="space-y-4">
          <button
            onClick={handleCreateEvent}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
            disabled={loading}
          >
            Create Test Event
          </button>

          <button
            onClick={handleLogout}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      )}

      {/* Federated Signing Status */}
      {isAuthenticated && (
        <div className="mt-6 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">
            Federated Signing Status
          </h2>
          <div className="space-y-2">
            <p>
              <span className="font-medium">Pending Events:</span>{" "}
              {federatedSigning.pendingEvents.length}
            </p>
            <p>
              <span className="font-medium">Active Sessions:</span>{" "}
              {federatedSigning.activeSessions.length}
            </p>
            {federatedSigning.error && (
              <p className="text-red-600">
                <span className="font-medium">Error:</span>{" "}
                {federatedSigning.error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * App wrapper with SecureTokenProvider
 */
function App() {
  return (
    <SecureTokenProvider config={tokenConfig}>
      <SecureTokenExample />
    </SecureTokenProvider>
  );
}

export default App;

/**
 * Additional security considerations and server-side implementation notes:
 *
 * 1. SERVER-SIDE REQUIREMENTS:
 *    - Implement httpOnly cookie support for refresh tokens
 *    - Add CSRF protection for token refresh endpoints
 *    - Implement proper token rotation and revocation
 *    - Use secure, HttpOnly, SameSite cookies
 *
 * 2. EXAMPLE SERVER ENDPOINTS (Express.js):
 *
 * ```javascript
 * // Set refresh token as httpOnly cookie
 * app.post('/api/auth/set-refresh-cookie', authenticate, (req, res) => {
 *   const { refreshToken, expiresAt } = req.body;
 *
 *   res.cookie('refreshToken', refreshToken, {
 *     httpOnly: true,
 *     secure: process.env.NODE_ENV === 'production',
 *     sameSite: 'strict',
 *     expires: new Date(expiresAt)
 *   });
 *
 *   res.json({ success: true });
 * });
 *
 * // Restore tokens from httpOnly cookie
 * app.post('/api/auth/restore-from-cookie', (req, res) => {
 *   const refreshToken = req.cookies.refreshToken;
 *
 *   if (!refreshToken) {
 *     return res.status(401).json({ error: 'No refresh token' });
 *   }
 *
 *   // Validate and refresh token
 *   // Return new token data
 * });
 *
 * // Clear refresh token cookie
 * app.post('/api/auth/clear-refresh-cookie', (req, res) => {
 *   res.clearCookie('refreshToken');
 *   res.json({ success: true });
 * });
 * ```
 *
 * 3. SECURITY FEATURES:
 *    - Tokens stored in memory only (no localStorage/sessionStorage)
 *    - Automatic token rotation before expiration
 *    - Proper cleanup on logout and page unload
 *    - HttpOnly cookie fallback for refresh tokens
 *    - XSS attack mitigation
 *    - Automatic retry on token refresh failure
 *
 * 4. MIGRATION FROM LOCALSTORAGE:
 *    - Replace all localStorage.getItem("authToken") calls
 *    - Update authentication flows to use setTokens()
 *    - Ensure server supports the new endpoints
 *    - Test token rotation and expiration handling
 */
