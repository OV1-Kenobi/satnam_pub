# Development Setup Guide

This guide will help you set up the full-stack Satnam.pub application for development.

## Architecture Overview

The application consists of:

- **Frontend**: React + Vite (port 3000)
- **Backend**: Express.js API server (port 8000)
- **Database**: PostgreSQL (optional for basic development)
- **Cache**: Redis (optional for basic development)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the development environment file:

```bash
cp .env.development .env.local
```

Edit `.env.local` with your specific configuration if needed.

### 3. Start Development Servers

**Option A: Manual Start (Recommended for debugging)**

Terminal 1 - Backend Server:

```bash
npm run server:dev
```

Terminal 2 - Frontend Server:

```bash
npm run dev
```

**Option B: Auto Start**

```bash
npm run start:dev:auto
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Health Check: http://localhost:8000/health

## Frontend-Backend Integration

### API Communication

The frontend communicates with the backend through:

1. **Vite Proxy**: All `/api/*` requests are proxied to `http://localhost:8000`
2. **API Client**: `src/lib/api.ts` provides typed API functions
3. **Auth Hook**: `src/hooks/useAuth.ts` manages authentication state
4. **Server Status**: `src/components/ServerStatus.tsx` shows connection status

### Available API Endpoints

#### Authentication

- `POST /api/auth/nostr` - Nostr authentication
- `POST /api/auth/nwc` - Nostr Wallet Connect
- `POST /api/auth/otp/initiate` - Start OTP flow
- `POST /api/auth/otp/verify` - Verify OTP
- `GET /api/auth/session` - Get current session
- `POST /api/auth/refresh` - Refresh session
- `POST /api/auth/logout` - Logout

#### Identity Management

- `POST /api/identity/register` - Register new identity
- `POST /api/identity/recover-nsec` - Recover private key
- `POST /api/register` - Privacy-first registration (requires auth)

#### Family Banking

- `POST /api/register/family` - Register family (requires auth)
- `POST /api/individual/cashu/bearer` - Create Cashu bearer token

#### Health

- `GET /api/health` - Server health check

### Using the API Client

```typescript
import { authAPI, identityAPI, healthAPI } from "../lib/api";

// Check server health
const isHealthy = await healthAPI.check();

// Authenticate with Nostr
const authResult = await authAPI.authenticateNostr({ signedEvent });

// Register new identity
const registerResult = await identityAPI.register({
  username: "alice",
  password: "secure-password",
});
```

### Using the Auth Hook

```typescript
import useAuth from '../hooks/useAuth';

function MyComponent() {
  const { user, authenticated, loading, login, logout } = useAuth();

  const handleLogin = async () => {
    const success = await login('nostr', { signedEvent });
    if (success) {
      console.log('Logged in as:', user);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!authenticated) return <button onClick={handleLogin}>Login</button>;

  return (
    <div>
      Welcome, {user?.username || user?.npub}!
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Development Features

### Server Status Indicator

The app includes a server status indicator in the navigation that shows:

- ✅ Server Online (green)
- ❌ Server Offline (red)
- 🔄 Checking... (yellow)

### Hot Reload

Both frontend and backend support hot reload:

- Frontend: Vite automatically reloads on file changes
- Backend: Uses `tsx --watch` for automatic restart

### Error Handling

The API client includes comprehensive error handling:

- Network errors
- HTTP status errors
- JSON parsing errors
- Authentication errors

## Testing

### Frontend Tests

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage
```

### Backend Tests

```bash
npm run test:backend       # Backend tests
npm run test:api          # API integration tests
```

### Full Integration Tests

```bash
npm run test:integration   # Full stack tests
```

## Troubleshooting

### Common Issues

1. **"Failed to get session info" errors**

   - Make sure backend server is running: `npm run server:dev`
   - Check that port 8000 is not in use
   - Verify API proxy is working in browser dev tools

2. **CORS errors**

   - Backend is configured to allow `localhost:3000`
   - Check that both servers are running on correct ports

3. **Database connection errors**

   - Database is optional for basic development
   - Most features work with mock data
   - For full functionality, set up PostgreSQL

4. **Authentication not working**
   - Check that JWT_SECRET is set in `.env.local`
   - Verify cookies are being sent (credentials: 'include')
   - Check browser dev tools for authentication errors

### Debug Mode

Enable debug logging:

```bash
# In .env.local
DEBUG=true
LOG_LEVEL=debug
```

### Network Debugging

Monitor API calls in browser dev tools:

1. Open Network tab
2. Filter by "api"
3. Check request/response details

## Production Deployment

For production deployment:

1. Build the frontend:

   ```bash
   npm run build
   ```

2. Set production environment variables
3. Use a process manager like PM2 for the backend
4. Set up proper database and Redis instances
5. Configure reverse proxy (nginx/Apache)

## Contributing

1. Make sure all tests pass: `npm test`
2. Follow the existing code style
3. Add tests for new features
4. Update this documentation if needed

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the console logs in both frontend and backend
3. Check the GitHub issues for similar problems
4. Create a new issue with detailed error information
