# 🏰 Frontend Integration Guide - Rebuilding Camelot OTP

## Overview

This guide shows how to integrate the Rebuilding Camelot OTP authentication system into your React frontend application.

## Components Created

### 1. **FamilyFederationAuth.tsx** - Main Authentication Component

- Complete OTP authentication flow
- Real-time countdown timer
- Proper error handling and user feedback
- Responsive design with Tailwind CSS
- Integration with the backend API endpoints

### 2. **useFamilyAuth.ts** - Authentication Hook

- Manages authentication state
- Handles localStorage persistence
- Provides login/logout functionality
- Session validation

### 3. **ProtectedFamilyRoute.tsx** - Route Protection

- Role-based access control
- Whitelist verification
- Guardian approval checks
- Graceful error handling with user-friendly messages

### 4. **FamilyDashboardExample.tsx** - Example Implementation

- Shows how to use the authentication system
- Displays user information and permissions
- Example family financial dashboard

## Quick Integration

### Step 1: Add to Your App Router

```tsx
// In your main App.tsx or router configuration
import FamilyFederationAuth from './components/FamilyFederationAuth';
import FamilyDashboardExample from './components/examples/FamilyDashboardExample';

// Add routes
<Route path="/family/auth" component={FamilyFederationAuth} />
<Route path="/family/dashboard" component={FamilyDashboardExample} />
```

### Step 2: Use the Authentication Hook

```tsx
import { useFamilyAuth } from "./hooks/useFamilyAuth";

const MyComponent = () => {
  const { isAuthenticated, userAuth, logout } = useFamilyAuth();

  if (!isAuthenticated) {
    return <FamilyFederationAuth />;
  }

  return (
    <div>
      <h1>Welcome, {userAuth?.nip05}!</h1>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
};
```

### Step 3: Protect Routes

```tsx
import ProtectedFamilyRoute from "./components/auth/ProtectedFamilyRoute";

const AdminPanel = () => (
  <ProtectedFamilyRoute
    requiredRole="guardian"
    requireWhitelist={true}
    requireGuardianApproval={true}
  >
    <AdminDashboard />
  </ProtectedFamilyRoute>
);
```

## API Integration

The components automatically integrate with your backend API endpoints:

### OTP Initiation

```http
POST /api/auth/otp/initiate
{
  "npub": "npub1...",
  "nip05": "user@domain.com"
}
```

### OTP Verification

```http
POST /api/auth/otp/verify
{
  "otpKey": "npub1..._timestamp",
  "otp": "123456"
}
```

## User Experience Flow

1. **Input Phase**: User enters npub and optional nip05
2. **OTP Request**: System sends encrypted DM via Rebuilding Camelot
3. **OTP Entry**: User receives DM and enters 6-digit code
4. **Verification**: System validates OTP and creates session
5. **Dashboard**: User accesses protected family features

## Features

### 🔐 Security Features

- **Encrypted DM delivery** via Nostr NIP-04
- **Session token management** with localStorage
- **Role-based access control** with multiple permission levels
- **Automatic session validation** on app load
- **Secure logout** with token cleanup

### 🎨 UI/UX Features

- **Real-time countdown timer** for OTP expiration
- **Loading states** with spinners and disabled buttons
- **Comprehensive error handling** with user-friendly messages
- **Responsive design** that works on all devices
- **Accessibility features** with proper labels and ARIA attributes

### 🛡️ Permission System

- **Whitelist checking** - Ensures user is authorized
- **Role verification** - Supports guardian, member, etc.
- **Guardian approval** - Additional security layer
- **Voting power** - Tracks user's governance weight

## Customization

### Styling

The components use Tailwind CSS classes. You can customize:

```tsx
// Change color scheme
className = "bg-orange-500"; // Change to your brand color
className = "border-orange-200"; // Matching border colors
```

### Messages

Customize user-facing messages:

```tsx
const customMessages = {
  otpSent: "🔐 Check your Nostr DMs for the authentication code!",
  otpExpired: "⏰ Your code has expired. Please request a new one.",
  authSuccess: "🎉 Welcome to the family financial system!",
};
```

### Permissions

Adjust permission requirements:

```tsx
<ProtectedFamilyRoute
  requiredRole="member" // or "guardian", "admin"
  requireWhitelist={true}
  requireGuardianApproval={false} // Set based on your needs
>
```

## Error Handling

The system handles various error scenarios:

### Network Errors

- Connection timeouts
- Server unavailability
- API endpoint errors

### Authentication Errors

- Invalid OTP codes
- Expired sessions
- Insufficient permissions
- Whitelist violations

### User Experience Errors

- Form validation
- Missing required fields
- Rate limiting

## Testing

### Manual Testing Checklist

1. **Authentication Flow**

   - [ ] Enter valid npub and request OTP
   - [ ] Receive DM from RebuildingCamelot@satnam.pub
   - [ ] Enter correct OTP and verify authentication
   - [ ] Test invalid OTP handling
   - [ ] Test OTP expiration

2. **Permission System**

   - [ ] Test whitelist enforcement
   - [ ] Test role-based access
   - [ ] Test guardian approval requirements

3. **Session Management**
   - [ ] Test session persistence across page reloads
   - [ ] Test logout functionality
   - [ ] Test session expiration handling

### Automated Testing

```tsx
// Example test with React Testing Library
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FamilyFederationAuth from "./FamilyFederationAuth";

test("should send OTP when valid npub is provided", async () => {
  render(<FamilyFederationAuth />);

  const npubInput = screen.getByPlaceholderText("npub1...");
  const sendButton = screen.getByText("Send OTP via Nostr DM");

  fireEvent.change(npubInput, { target: { value: "npub1test..." } });
  fireEvent.click(sendButton);

  await waitFor(() => {
    expect(screen.getByText(/OTP sent successfully/)).toBeInTheDocument();
  });
});
```

## Production Considerations

### Environment Variables

Ensure your frontend build process includes:

```env
REACT_APP_API_BASE_URL=https://your-api-domain.com
REACT_APP_NOSTR_RELAY_URL=wss://relay.satnam.pub
```

### Performance

- Components use React hooks efficiently
- localStorage operations are wrapped in try-catch
- Network requests include proper error handling
- Loading states prevent multiple simultaneous requests

### Security

- Session tokens are stored in localStorage (consider httpOnly cookies for enhanced security)
- No sensitive data is logged to console in production
- API calls use proper CORS headers
- Input validation prevents XSS attacks

## Troubleshooting

### Common Issues

1. **"OTP not received"**

   - Check Nostr client is connected to relays
   - Verify npub format is correct
   - Ensure Rebuilding Camelot account is properly configured

2. **"Authentication failed"**

   - Check API endpoints are accessible
   - Verify Supabase configuration
   - Check browser console for network errors

3. **"Access denied"**
   - Verify user is whitelisted in family federation
   - Check role assignments in database
   - Ensure guardian approval if required

### Debug Mode

Enable debug logging:

```tsx
// Add to your component
useEffect(() => {
  if (process.env.NODE_ENV === "development") {
    console.log("Auth state:", { isAuthenticated, userAuth });
  }
}, [isAuthenticated, userAuth]);
```

## Support

For integration support:

1. Check the [main documentation](./REBUILDING_CAMELOT_OTP.md)
2. Review the [API documentation](../api/auth/README.md)
3. Test with the provided example components
4. Check browser console for error messages

---

_🏰 "Every sovereign family needs a secure gateway to their financial realm."_
