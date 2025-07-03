# Payment Automation API Documentation

## Overview

The Payment Automation API provides comprehensive family payment management capabilities with Lightning Network integration through PhoenixD. This API enables parents to set up automated payment schedules, distribute instant payments, and manage approval workflows for their family members.

## Features

- **Automated Scheduling**: Set up recurring payment distributions (daily, weekly, monthly)
- **Instant Distributions**: Send immediate payments with optional approval workflows
- **Approval Management**: Review and approve large payment requests
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
/api/family/payment-automation
```

### Authentication

All endpoints require valid JWT authentication with family scope.

---

## Create Payment Schedule

Creates a new recurring payment schedule for a family member.

**Endpoint:** `POST /create-schedule`

### Request Body

```typescript
interface PaymentScheduleRequest {
  familyMemberId: string; // UUID of family member
  amount: number; // Amount in satoshis (1000-1000000)
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  timeOfDay: string; // HH:MM format (e.g., "09:00")
  parentApprovalRequired?: boolean; // Default: false
  autoDistribution?: boolean; // Default: true
}
```

### Response

```typescript
interface PaymentScheduleResponse {
  success: boolean;
  scheduleId?: string;
  nextDistribution?: string; // ISO timestamp
  errorMessage?: string;
}
```

### Example Request

```bash
curl -X POST /api/family/payment-automation/create-schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "familyMemberId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 10000,
    "frequency": "weekly",
    "dayOfWeek": 1,
    "timeOfDay": "09:00"
  }'
```

### Example Response

```json
{
  "success": true,
  "scheduleId": "schedule_1704067200000",
  "nextDistribution": "2024-01-08T09:00:00.000Z",
  "message": "Payment schedule created for Alice"
}
```

---

## Distribute Payment Now

Distributes an immediate payment to a family member.

**Endpoint:** `POST /distribute-now`

### Request Body

```typescript
interface PaymentDistributionRequest {
  familyMemberId: string; // UUID of family member
  amount: number; // Amount in satoshis (1000-1000000)
  reason?: string; // Optional reason (max 200 chars)
  isEmergency?: boolean; // Default: false
}
```

### Response

```typescript
interface PaymentDistributionResponse {
  success: boolean;
  distributionId?: string;
  paymentId?: string;
  amountSat: number;
  feeSat: number;
  status: "completed" | "pending_approval" | "failed";
  errorMessage?: string;
}
```

### Example Request

```bash
curl -X POST /api/family/payment-automation/distribute-now \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "familyMemberId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 25000,
    "reason": "Extra payment for good grades"
  }'
```

### Example Response

```json
{
  "success": true,
  "distributionId": "dist_1704067200000",
  "paymentId": "pay_1704067200000",
  "amountSat": 25000,
  "feeSat": 25,
  "status": "completed",
  "message": "Payment of 25000 sats sent to Alice"
}
```

---

## Get Payment Schedules

Retrieves all payment schedules for a family.

**Endpoint:** `GET /schedules`

### Query Parameters

- `familyId`: UUID of the family

### Response

```typescript
interface SchedulesResponse {
  success: boolean;
  schedules: Array<{
    scheduleId: string;
    familyMemberId: string;
    memberName: string;
    amount: number;
    frequency: string;
    nextDistribution: string;
    enabled: boolean;
  }>;
  count: number;
}
```

### Example Request

```bash
curl -X GET /api/family/payment-automation/schedules \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -G -d "familyId=123e4567-e89b-12d3-a456-426614174000"
```

---

## Get Pending Approvals

Retrieves all pending approval requests for a family.

**Endpoint:** `GET /pending-approvals`

### Query Parameters

- `familyId`: UUID of the family

### Response

```typescript
interface ApprovalsResponse {
  success: boolean;
  approvals: Array<{
    approvalId: string;
    familyMemberId: string;
    memberName: string;
    amount: number;
    reason: string;
    requestedAt: string;
    expiresAt: string;
  }>;
  count: number;
}
```

### Example Request

```bash
curl -X GET /api/family/payment-automation/pending-approvals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -G -d "familyId=123e4567-e89b-12d3-a456-426614174000"
```

---

## Approve Payment

Approves or denies a pending payment request.

**Endpoint:** `PUT /approve`

### Request Body

```typescript
interface ApprovalRequest {
  approvalId: string; // UUID of approval request
  approved: boolean;
  reason?: string; // Optional reason (max 500 chars)
}
```

### Response

```typescript
interface ApprovalResponse {
  success: boolean;
  approvalId: string;
  status: "approved" | "denied";
  processedAt: string;
  errorMessage?: string;
}
```

### Example Request

```bash
curl -X PUT /api/family/payment-automation/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "approvalId": "approval_1704067200000",
    "approved": true,
    "reason": "Approved for emergency expense"
  }'
```

### Example Response

```json
{
  "success": true,
  "approvalId": "approval_1704067200000",
  "status": "approved",
  "processedAt": "2024-01-01T12:00:00.000Z",
  "message": "Payment approved successfully"
}
```

---

## Error Handling

### Common Error Responses

```typescript
interface ErrorResponse {
  success: false;
  errorMessage: string;
}
```

### Error Codes

- `400`: Bad Request - Invalid input data
- `401`: Unauthorized - Invalid or missing authentication
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `405`: Method Not Allowed - Invalid HTTP method
- `500`: Internal Server Error - Server-side error

### Example Error Response

```json
{
  "success": false,
  "errorMessage": "Family member not found"
}
```

---

## Rate Limiting

Rate limiting is planned for future implementation to protect against abuse:

- **Schedule Creation**: 10 requests per hour per family
- **Payment Distribution**: 50 requests per hour per family
- **Approval Actions**: 100 requests per hour per family

---

## Integration Example

```typescript
// Initialize payment automation
const paymentAPI = new PaymentAutomationAPI({
  baseURL: "/api/family/payment-automation",
  authToken: "YOUR_JWT_TOKEN",
});

// Create weekly payment schedule
const schedule = await paymentAPI.createSchedule({
  familyMemberId: "member-uuid",
  amount: 15000, // 15k sats
  frequency: "weekly",
  dayOfWeek: 1, // Monday
  timeOfDay: "09:00",
});

// Distribute immediate payment
const distribution = await paymentAPI.distributeNow({
  familyMemberId: "member-uuid",
  amount: 5000, // 5k sats
  reason: "Extra payment for chores",
});

// Check pending approvals
const approvals = await paymentAPI.getPendingApprovals({
  familyId: "family-uuid",
});
```

---

## Security Best Practices

1. **Always validate amounts** before processing
2. **Use approval workflows** for amounts above threshold
3. **Log all operations** for audit purposes
4. **Implement rate limiting** in production
5. **Validate family member access** before processing
6. **Use HTTPS** for all API communications
7. **Implement proper error handling** to prevent information leakage

---

## Support

For questions or issues:

- Documentation: https://docs.satnam.pub/api/payment
- Support: support@satnam.pub
- GitHub Issues: https://github.com/satnam-pub/issues
