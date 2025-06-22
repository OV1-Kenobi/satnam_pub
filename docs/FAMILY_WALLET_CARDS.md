# Family Wallet Cards - Satnam.pub Sovereign Banking

## Overview

The FamilyWalletCard component provides a comprehensive display for family member Lightning wallets in the Satnam.pub sovereign banking platform. Each card shows essential wallet information, Lightning addresses, spending limits, and recent activity indicators.

## Features

### Core Functionality

- **Family Member Display**: Shows username and role (parent/child)
- **Lightning Address**: Displays formatted addresses as `username@satnam.pub`
- **Copy-to-Clipboard**: One-click copying of Lightning addresses with visual feedback
- **Spending Limits**: Configurable limits for children, unlimited for parents
- **Wallet Balance**: Real-time balance display in satoshis
- **Recent Activity**: Transaction history and activity indicators
- **NIP-05 Verification**: Visual verification status with checkmark badges

### Technical Implementation

- **Component Name**: `FamilyWalletCard`
- **File Location**: `src/components/FamilyWalletCard.tsx`
- **API Endpoint**: `/api/family/members`
- **Styling**: Tailwind CSS with orange/amber accent theme
- **State Management**: Local state for UI interactions, global state for member data

## Interface Definition

```typescript
interface FamilyMember {
  id: string;
  username: string;
  lightningAddress: string;
  role: "parent" | "child";
  spendingLimits?: {
    daily: number;
    weekly: number;
  };
  nip05Verified: boolean;
  balance?: number;
  recentActivity?: {
    lastTransaction: string;
    transactionCount24h: number;
  };
}

interface FamilyWalletCardProps {
  member: FamilyMember;
  onCopyAddress: () => void;
  onSend?: (memberId: string) => void;
  onReceive?: (memberId: string) => void;
  onShowQR?: (memberId: string, address: string) => void;
}
```

## Usage Examples

### Basic Usage

```tsx
import FamilyWalletCard from "./components/FamilyWalletCard";

const member = {
  id: "1",
  username: "satnam_dad",
  lightningAddress: "satnam_dad@satnam.pub",
  role: "parent",
  nip05Verified: true,
  balance: 5000000,
  recentActivity: {
    lastTransaction: "2 hours ago",
    transactionCount24h: 12,
  },
};

<FamilyWalletCard
  member={member}
  onCopyAddress={() => console.log("Address copied!")}
  onSend={(id) => console.log("Send to:", id)}
  onReceive={(id) => console.log("Receive for:", id)}
  onShowQR={(id, address) => console.log("Show QR:", address)}
/>;
```

### With API Integration

```tsx
import { useEffect, useState } from "react";
import FamilyWalletCard from "./components/FamilyWalletCard";

function FamilyWallets() {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    fetch("/api/family/members")
      .then((res) => res.json())
      .then((data) => setMembers(data.data.members));
  }, []);

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {members.map((member) => (
        <FamilyWalletCard
          key={member.id}
          member={member}
          onCopyAddress={() => handleCopyAddress(member.username)}
          onSend={handleSend}
          onReceive={handleReceive}
          onShowQR={handleShowQR}
        />
      ))}
    </div>
  );
}
```

## API Endpoints

### GET /api/family/members

Retrieves all family members with their wallet information.

**Query Parameters:**

- `familyId` (optional): Filter by family ID
- `role` (optional): Filter by role ('parent' or 'child')
- `verified` (optional): Filter by NIP-05 verification status

**Response:**

```json
{
  "success": true,
  "data": {
    "members": [
      {
        "id": "1",
        "username": "satnam_dad",
        "lightningAddress": "satnam_dad@satnam.pub",
        "role": "parent",
        "nip05Verified": true,
        "balance": 5000000,
        "recentActivity": {
          "lastTransaction": "2 hours ago",
          "transactionCount24h": 12
        }
      }
    ]
  },
  "meta": {
    "totalMembers": 1,
    "timestamp": "2024-01-15T10:30:00Z",
    "demo": true
  }
}
```

### POST /api/family/members

Creates a new family member.

**Request Body:**

```json
{
  "username": "new_member",
  "role": "child",
  "spendingLimits": {
    "daily": 50000,
    "weekly": 200000
  }
}
```

### PUT /api/family/members/:id

Updates an existing family member.

### DELETE /api/family/members/:id

Removes a family member.

## Mock Data

The component includes comprehensive mock data for demonstration purposes:

```typescript
export const mockFamilyMembers: FamilyMember[] = [
  {
    id: "1",
    username: "satnam_dad",
    lightningAddress: "satnam_dad@satnam.pub",
    role: "parent",
    nip05Verified: true,
    balance: 5000000,
    recentActivity: {
      lastTransaction: "2 hours ago",
      transactionCount24h: 12,
    },
  },
  // ... more members
];
```

## Styling and Theme

The component uses a consistent orange/amber color scheme:

- **Primary Colors**: Orange-500 to Amber-500 gradients
- **Accent Colors**: Orange-400, Amber-400 for highlights
- **Background**: White/10 with backdrop blur for glass effect
- **Borders**: White/20 with orange/amber hover states
- **Text**: White primary, orange/amber secondary

### Key CSS Classes

```css
/* Card Container */
.bg-white/10 .backdrop-blur-sm .rounded-2xl .border-white/20

/* Gradient Backgrounds */
.bg-gradient-to-r .from-orange-500 .to-amber-500

/* Hover Effects */
.hover:border-orange-500/30 .hover:shadow-orange-500/25

/* Status Indicators */
.text-green-400 /* Verified */
.text-amber-400 /* Pending */
```

## Component Features

### Visual Elements

1. **Avatar Circle**: Gradient background with username initial
2. **Role Badge**: Color-coded role indicator
3. **Verification Status**: NIP-05 verification with icons
4. **Lightning Address**: Monospace font with copy button
5. **Spending Limits**: Hierarchical display of limits
6. **Activity Indicators**: Recent transaction information
7. **Action Buttons**: Send, Receive, and QR code generation

### Interactive Elements

1. **Copy Button**: Clipboard integration with visual feedback
2. **Action Buttons**: Customizable callback functions
3. **Hover Effects**: Enhanced visual feedback
4. **Loading States**: Smooth transitions and animations

### Accessibility

- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: Proper ARIA labels and descriptions
- **Color Contrast**: WCAG compliant color combinations
- **Focus Indicators**: Clear focus states for all interactive elements

## Integration with Existing Components

The FamilyWalletCard integrates seamlessly with:

- **FamilyDashboard**: Main family management interface
- **PhoenixDNodeStatus**: Lightning node status monitoring
- **TransactionHistory**: Payment history tracking
- **SmartPaymentModal**: Payment processing interface

## Demo Component

A complete demo component (`FamilyWalletDemo`) is available that showcases:

- API integration with fallback to mock data
- Error handling and loading states
- Copy functionality with user feedback
- Responsive grid layout
- Parent/child role separation

## Security Considerations

- **Lightning Addresses**: Validated format and domain
- **Spending Limits**: Enforced at API level
- **NIP-05 Verification**: Cryptographic verification
- **Privacy Protection**: No sensitive data in client state
- **Input Validation**: All user inputs sanitized

## Performance Optimizations

- **Lazy Loading**: Images and heavy components
- **Memoization**: React.memo for expensive renders
- **Debounced API Calls**: Reduced server load
- **Efficient Re-renders**: Optimized state updates

## Future Enhancements

1. **Real-time Updates**: WebSocket integration for live data
2. **Advanced Filtering**: Search and sort capabilities
3. **Bulk Operations**: Multi-select actions
4. **Export Features**: CSV/PDF export of wallet data
5. **Mobile Optimization**: Enhanced mobile experience
6. **Offline Support**: PWA capabilities with local storage

## Testing

The component includes comprehensive test coverage:

- **Unit Tests**: Component rendering and interactions
- **Integration Tests**: API integration and error handling
- **E2E Tests**: Complete user workflows
- **Accessibility Tests**: Screen reader and keyboard navigation

## Support and Documentation

For additional support and documentation:

- **Component Documentation**: Inline JSDoc comments
- **API Documentation**: OpenAPI/Swagger specifications
- **Usage Examples**: Complete working examples
- **Troubleshooting Guide**: Common issues and solutions
