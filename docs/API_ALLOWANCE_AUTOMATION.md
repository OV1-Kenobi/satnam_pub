# Allowance Automation API Documentation

## Overview

The Allowance Automation API provides comprehensive family allowance management capabilities with Lightning Network integration through PhoenixD. This API enables parents to set up automated allowance schedules, distribute instant allowances, and manage approval workflows for their family members.

## Features

- **Automated Scheduling**: Set up recurring allowance distributions (daily, weekly, monthly)
- **Instant Distributions**: Send immediate allowances with optional approval workflows
- **Approval Management**: Review and approve large allowance requests
- **Lightning Integration**: Seamless Bitcoin payments via PhoenixD
- **Audit Logging**: Complete transaction history and security monitoring
- **Input Validation**: Comprehensive validation using Zod schemas

## Security

- **Input Validation**: All requests validated using Zod schemas
- **Amount Limits**: Configurable limits with approval thresholds
- **Audit Logging**: Complete audit trail for all operations
- **Family Isolation**: All operations scoped to authenticated family
- **Rate Limiting**: Protection against abuse (TODO: Implementation needed)

## API Endpoints

### Base URL

```
/api/family/allowance-automation
```

### Authentication

All endpoints require valid JWT authentication with family scope.

---

## Create Allowance Schedule

Creates a new recurring allowance schedule for a family member.

**Endpoint:** `POST /create-schedule`

### Request Body

```typescript
interface AllowanceScheduleRequest {
  familyMemberId: string; // UUID of family member
  amount: number; // Amount in satoshis (1000-1000000)
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number; // 0-6 for weekly, 1-31 for monthly
  timeOfDay: string; // HH:MM format (24-hour)
  parentApprovalRequired?: boolean;
  autoDistribution?: boolean;
}
```

### Response

```typescript
interface AllowanceScheduleResponse {
  success: boolean;
  scheduleId?: string;
  nextDistribution?: string; // ISO datetime string
  errorMessage?: string;
  timestamp: string;
}
```

### Examples

**Daily Allowance**

```bash
curl -X POST /api/family/allowance-automation/create-schedule \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "familyMemberId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 5000,
    "frequency": "daily",
    "timeOfDay": "09:00"
  }'
```

**Weekly Allowance (Sundays)**

```bash
curl -X POST /api/family/allowance-automation/create-schedule \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "familyMemberId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 25000,
    "frequency": "weekly",
    "dayOfWeek": 0,
    "timeOfDay": "10:00"
  }'
```

---

## Distribute Allowance Now

Sends an immediate allowance distribution to a family member.

**Endpoint:** `POST /distribute-now`

### Request Body

```typescript
interface AllowanceDistributionRequest {
  familyMemberId: string; // UUID of family member
  amount: number; // Amount in satoshis (1000-1000000)
  reason?: string; // Optional description (max 200 chars)
  isEmergency?: boolean; // Bypasses approval for large amounts
}
```

### Response

```typescript
interface AllowanceDistributionResponse {
  success: boolean;
  distributionId?: string;
  paymentId?: string; // Lightning payment ID
  amountSat: number;
  feeSat: number;
  status: "completed" | "pending_approval" | "failed";
  errorMessage?: string;
  timestamp: string;
}
```

### Examples

**Regular Distribution**

```bash
curl -X POST /api/family/allowance-automation/distribute-now \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "familyMemberId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 10000,
    "reason": "Weekly allowance"
  }'
```

**Emergency Distribution**

```bash
curl -X POST /api/family/allowance-automation/distribute-now \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "familyMemberId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 75000,
    "reason": "Emergency lunch money",
    "isEmergency": true
  }'
```

---

## Get Allowance Schedules

Retrieves all active allowance schedules for the authenticated family.

**Endpoint:** `GET /schedules`

### Response

```typescript
interface SchedulesResponse {
  success: boolean;
  schedules: Array<{
    id: string;
    familyMemberId: string;
    amount: number;
    frequency: "daily" | "weekly" | "monthly";
    nextDistribution: string; // ISO datetime string
    isActive: boolean;
    createdAt: string;
    timeOfDay: string;
    dayOfWeek?: number;
  }>;
  timestamp: string;
}
```

### Example

```bash
curl -X GET /api/family/allowance-automation/schedules \
  -H "Authorization: Bearer <jwt_token>"
```

---

## Get Pending Approvals

Retrieves all pending approval requests for allowance distributions.

**Endpoint:** `GET /pending-approvals`

### Response

```typescript
interface ApprovalsResponse {
  success: boolean;
  approvals: Array<{
    id: string;
    familyMemberId: string;
    amount: number;
    reason?: string;
    requestedAt: string; // ISO datetime string
    expiresAt: string; // ISO datetime string
    isEmergency: boolean;
    status: "pending";
  }>;
  timestamp: string;
}
```

### Example

```bash
curl -X GET /api/family/allowance-automation/pending-approvals \
  -H "Authorization: Bearer <jwt_token>"
```

---

## Approve Allowance

Approves or denies a pending allowance distribution request.

**Endpoint:** `PUT /approve`

### Request Body

```typescript
interface ApprovalRequest {
  approvalId: string; // UUID of approval request
  approved: boolean; // true to approve, false to deny
  reason?: string; // Optional reason (max 500 chars)
}
```

### Response

```typescript
interface ApprovalResponse {
  success: boolean;
  approvalId: string;
  status: "approved" | "denied";
  processedAt: string; // ISO datetime string
  errorMessage?: string;
  timestamp: string;
}
```

### Examples

**Approve Request**

```bash
curl -X PUT /api/family/allowance-automation/approve \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "123e4567-e89b-12d3-a456-426614174000",
    "approved": true,
    "reason": "Approved for good grades"
  }'
```

**Deny Request**

```bash
curl -X PUT /api/family/allowance-automation/approve \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "123e4567-e89b-12d3-a456-426614174000",
    "approved": false,
    "reason": "Need to discuss spending limits first"
  }'
```

---

## Error Handling

All endpoints return standardized error responses:

```typescript
interface ErrorResponse {
  success: false;
  errorMessage: string;
  timestamp: string;
}
```

### Common Error Codes

- **400 Bad Request**: Invalid input data or validation errors
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Insufficient permissions for operation
- **404 Not Found**: Family member or approval request not found
- **405 Method Not Allowed**: HTTP method not supported for endpoint
- **500 Internal Server Error**: Server-side processing error

### Validation Errors

Validation errors include detailed field-specific messages:

```json
{
  "success": false,
  "errorMessage": "Validation error: Invalid family member ID format, Minimum amount is 1000 sats",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

## Rate Limiting

**TODO**: Implement rate limiting with the following proposed limits:

- **Schedule Creation**: 10 requests per hour per family
- **Instant Distributions**: 50 requests per hour per family
- **Approval Operations**: 100 requests per hour per family

---

## Configuration

### Environment Variables

- `APPROVAL_THRESHOLD_SATS`: Amount requiring approval (default: 50000)
- `MAX_EMERGENCY_AMOUNT_SATS`: Maximum emergency amount (default: 100000)
- `PHOENIXD_API_URL`: PhoenixD server URL
- `PHOENIXD_API_TOKEN`: PhoenixD authentication token

### Constants

```typescript
const APPROVAL_THRESHOLD_SATS = 50000; // 50,000 sats
const MAX_EMERGENCY_AMOUNT_SATS = 100000; // 100,000 sats
```

---

## TODO Items

### High Priority

1. **Database Integration**: Replace mock data with actual database queries
2. **Authentication**: Implement family-scoped JWT validation
3. **Rate Limiting**: Add protection against API abuse
4. **Audit Logging**: Persistent audit trail in database

### Medium Priority

1. **Pagination**: Support for large families with many schedules
2. **Schedule Management**: Edit/delete existing schedules
3. **Notification System**: Alert parents about large requests
4. **Analytics**: Usage and spending analytics

### Low Priority

1. **Batch Operations**: Process multiple distributions at once
2. **Recurring Approval**: Auto-approve based on patterns
3. **Budget Management**: Monthly/weekly spending limits
4. **Mobile Push**: Real-time notifications

---

## Testing

### Unit Tests

```bash
npm run test:enhanced-family
```

### Integration Tests

```bash
npm run test:integration
```

### API Testing

```bash
npm run test:api
```

---

## Support

For technical support or questions about the Allowance Automation API:

- **Documentation**: [https://docs.satnam.pub/api/allowance](https://docs.satnam.pub/api/allowance)
- **GitHub Issues**: [https://github.com/OV1_kenobi/satnam/issues](https://github.com/OV1_kenobi/satnam/issues)
- **Email**: ov1_kenobi@mailfence.com

---

## License

MIT License - see [LICENSE](../../LICENSE) file for details.
