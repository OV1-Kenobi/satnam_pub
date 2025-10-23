# Phase 3 Hybrid - Technical Specifications

**Date**: 2025-10-22  
**Status**: PLANNING PHASE  
**Scope**: Detailed component and service specifications

---

## COMPONENT SPECIFICATIONS

### WEEK 1: Trust Provider UI Components

#### 1. TrustProviderMarketplace (350 lines)
**Purpose**: Browse and discover trust providers

**Props**:
```typescript
interface TrustProviderMarketplaceProps {
  onSubscribe?: (providerId: string) => void;
  onUnsubscribe?: (providerId: string) => void;
  showSubscribed?: boolean;
  maxResults?: number;
}
```

**Features**:
- Grid/list view toggle
- Filter by category, reputation, metrics
- Search functionality
- Pagination
- Provider detail modal
- Subscribe/unsubscribe actions
- Feature flag gating

**State Management**:
- providers: Provider[]
- filters: ProviderFilters
- selectedProvider: Provider | null
- loading: boolean
- error: string | null

---

#### 2. TrustFilterPanel (250 lines)
**Purpose**: Advanced filtering for trust-based searches

**Props**:
```typescript
interface TrustFilterPanelProps {
  onFilterChange: (filters: TrustFilters) => void;
  onSavePreset?: (name: string, filters: TrustFilters) => void;
  presets?: FilterPreset[];
}
```

**Features**:
- Trust score range slider
- Provider multi-select
- Verification method checkboxes
- Trust level selector
- Save/load filter presets
- Clear filters button

---

#### 3. TrustMetricsComparison (300 lines)
**Purpose**: Compare metrics across providers

**Props**:
```typescript
interface TrustMetricsComparisonProps {
  providers: TrustedProvider[];
  metrics?: TrustMetrics[];
  showChart?: boolean;
  exportable?: boolean;
}
```

**Features**:
- Side-by-side metric display
- Radar chart visualization
- Metric breakdown tables
- Highlight differences
- Export comparison data
- Responsive design

---

#### 4. UnifiedTrustDashboard (400 lines)
**Purpose**: Centralized trust management interface

**Props**:
```typescript
interface UnifiedTrustDashboardProps {
  userId: string;
  onNavigate?: (section: string) => void;
}
```

**Tabs**:
- Overview: Composite score, top providers, recent attestations
- Providers: Subscriptions, ratings, activity
- Metrics: All 6 metrics, trends, comparisons
- Attestations: History, verification, timeline
- Settings: Privacy, notifications, preferences

---

#### 5. AttestationDashboard (300 lines)
**Purpose**: Manage and display attestations

**Props**:
```typescript
interface AttestationDashboardProps {
  userId: string;
  filterType?: 'all' | 'simpleproof' | 'iroh' | 'nip85';
}
```

**Features**:
- List all attestations
- Filter by type and date
- Verify attestations
- Display verification status
- Export attestations
- Timeline view

---

### WEEK 2: Dashboard & Integration Components

#### 6. TrustDashboardOverview (300 lines)
**Purpose**: High-level trust overview

**Features**:
- Composite score display
- Top 3 providers
- Recent attestations (5 latest)
- Trust trends (7-day chart)
- Quick action buttons

---

#### 7. TrustPrivacySettings (250 lines)
**Purpose**: Configure privacy and visibility

**Features**:
- Privacy level selector (public/contacts/whitelist/private)
- Visible metrics configuration
- Whitelisted pubkeys management
- Data sharing preferences
- Audit log viewer

---

#### 8. SovereigntyControlsDashboard (modifications)
**Purpose**: Extend existing dashboard with attestations

**New Tab**: "Identity Attestations"
- AttestationHistoryTable integration
- ManualAttestationModal button
- AutomationSettings toggles
- Statistics summary

---

## SERVICE SPECIFICATIONS

### TrustProviderMarketplaceService

```typescript
class TrustProviderMarketplaceService {
  // List all providers with optional filters
  async listProviders(filters?: ProviderFilters): Promise<Provider[]>
  
  // Get detailed provider information
  async getProviderDetails(providerId: string): Promise<ProviderDetails>
  
  // Subscribe to a provider
  async subscribeToProvider(providerId: string): Promise<void>
  
  // Unsubscribe from a provider
  async unsubscribeFromProvider(providerId: string): Promise<void>
  
  // Rate a provider
  async rateProvider(
    providerId: string,
    rating: number,
    review?: string
  ): Promise<void>
  
  // Get provider ratings and reviews
  async getProviderRatings(providerId: string): Promise<ProviderRating[]>
  
  // Get user's subscriptions
  async getUserSubscriptions(): Promise<ProviderSubscription[]>
}
```

---

### UnifiedTrustDashboardService

```typescript
class UnifiedTrustDashboardService {
  // Get composite trust score from all providers
  async getCompositeScore(): Promise<number>
  
  // Aggregate metrics from all providers
  async getMetricsFromAllProviders(): Promise<AggregatedMetrics>
  
  // Get attestations from all sources
  async getAttestationsFromAllSources(): Promise<Attestation[]>
  
  // Check access control status
  async getAccessControlStatus(resource: string): Promise<AccessStatus>
  
  // Get privacy settings
  async getPrivacySettings(): Promise<PrivacySettings>
  
  // Update privacy settings
  async updatePrivacySettings(settings: PrivacySettings): Promise<void>
}
```

---

### TrustAccessControlService

```typescript
class TrustAccessControlService {
  // Check if user can access resource
  canAccessResource(resource: string, userRole: string): boolean
  
  // Get visible metrics based on privacy settings
  getVisibleMetrics(userRole: string): string[]
  
  // Check if data can be shared with peer
  canShareWith(peerId: string, privacyLevel: string): boolean
  
  // Log access decision
  logAccessDecision(
    resource: string,
    allowed: boolean,
    reason: string
  ): Promise<void>
}
```

---

## API ENDPOINT SPECIFICATIONS

### POST /api/trust/providers/subscribe
**Request**:
```json
{
  "provider_id": "uuid",
  "notification_preferences": {
    "score_changes": true,
    "new_attestations": true,
    "provider_updates": false
  }
}
```

**Response**:
```json
{
  "success": true,
  "subscription_id": "uuid",
  "subscribed_at": "2025-10-22T10:00:00Z"
}
```

---

### GET /api/trust/compare
**Query Params**:
- `provider_ids`: comma-separated UUIDs
- `metric_types`: comma-separated metric names
- `time_range`: '7d' | '30d' | '90d' | 'all'

**Response**:
```json
{
  "comparison": {
    "providers": [...],
    "metrics": {...},
    "trends": {...}
  }
}
```

---

### POST /api/trust/privacy-settings
**Request**:
```json
{
  "privacy_level": "contacts",
  "visible_metrics": ["rank", "followers"],
  "whitelisted_pubkeys": ["npub1..."],
  "encryption_enabled": true
}
```

**Response**:
```json
{
  "success": true,
  "settings_id": "uuid",
  "updated_at": "2025-10-22T10:00:00Z"
}
```

---

## TYPE DEFINITIONS

```typescript
interface Provider {
  id: string;
  pubkey: string;
  name: string;
  description: string;
  category: string;
  iconUrl: string;
  websiteUrl: string;
  rating: number;
  userCount: number;
  createdAt: number;
}

interface ProviderSubscription {
  id: string;
  providerId: string;
  subscribedAt: number;
  notificationPreferences: NotificationPreferences;
}

interface AggregatedMetrics {
  compositeScore: number;
  rank: number;
  followers: number;
  hops: number;
  influence: number;
  reliability: number;
  recency: number;
  providers: {
    [providerId: string]: TrustMetrics;
  };
}

interface PrivacySettings {
  privacyLevel: 'public' | 'contacts' | 'whitelist' | 'private';
  visibleMetrics: string[];
  whitelistedPubkeys: string[];
  encryptionEnabled: boolean;
}

interface AccessStatus {
  resource: string;
  allowed: boolean;
  reason: string;
  userRole: string;
  privacyLevel: string;
}
```

---

## TESTING SPECIFICATIONS

### Unit Tests (>80% coverage)

**TrustProviderMarketplaceService**:
- listProviders with various filters
- subscribeToProvider success/failure
- rateProvider validation
- getUserSubscriptions filtering

**UnifiedTrustDashboardService**:
- getCompositeScore aggregation
- getMetricsFromAllProviders merging
- getAccessControlStatus logic
- Privacy settings persistence

**TrustAccessControlService**:
- canAccessResource role checking
- getVisibleMetrics filtering
- canShareWith privacy validation
- logAccessDecision recording

---

### Integration Tests

**Trust Provider Workflow**:
- Discover provider → Subscribe → View metrics → Rate provider
- Unsubscribe → Verify removal

**Dashboard Workflow**:
- Load dashboard → View all metrics → Compare providers → Update settings

**Access Control Workflow**:
- Check access → Apply privacy settings → Log decision

---

## FEATURE FLAGS

```typescript
VITE_TRUST_PROVIDER_MARKETPLACE_ENABLED = true
VITE_TRUST_PROVIDER_RATINGS_ENABLED = true
VITE_UNIFIED_TRUST_DASHBOARD_ENABLED = true
VITE_TRUST_BASED_FILTERING_ENABLED = true
VITE_ATTESTATION_DASHBOARD_ENABLED = true
VITE_TRUST_PRIVACY_CONTROLS_ENABLED = true
VITE_TRUST_ACCESS_CONTROL_ENABLED = true
```

---

## PERFORMANCE CONSIDERATIONS

- **Caching**: Cache provider list (1 hour TTL)
- **Pagination**: 20 items per page for provider lists
- **Lazy Loading**: Load attestations on demand
- **Debouncing**: Debounce filter changes (300ms)
- **Memoization**: Memoize metric calculations

---

## SECURITY CONSIDERATIONS

- **RLS Policies**: Enforce user data isolation
- **Rate Limiting**: 100 requests/hour per endpoint
- **Input Validation**: Validate all user inputs
- **Encryption**: Encrypt sensitive data at rest
- **Audit Logging**: Log all access decisions

---

## NEXT STEPS

This technical specification provides detailed guidance for implementation.

**Ready for approval and implementation.**

