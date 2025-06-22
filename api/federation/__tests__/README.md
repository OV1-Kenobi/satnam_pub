# Federation Governance Test Suite

This directory contains comprehensive test suites for the Federation Governance API, demonstrating proper testing patterns for Fedimint integration.

## Test Files Overview

### 1. `governance.test.ts` - Unit Tests

Comprehensive unit tests covering:

- API endpoint functionality
- Proposal management and validation
- Vote casting mechanisms
- Consensus calculations
- Emergency protocol handling
- Guardian management
- Error handling scenarios
- Security validations
- Performance testing

### 2. `governance.integration.test.ts` - Integration Tests

Integration tests covering:

- Federation connection management
- End-to-end governance workflows
- Connection pool management
- Performance under load
- Error recovery scenarios
- Security integration
- Concurrent operations

### 3. `test-setup.ts` - Test Utilities

Shared utilities and helpers:

- Mock data generators
- Validation helpers
- Performance testing utilities
- Security testing helpers
- Error simulation tools

## Running the Tests

### Individual Test Suites

```bash
# Run unit tests only
npm run test:federation-governance

# Run integration tests only
npm run test:federation-integration

# Run all federation tests
npm run test:federation:all

# Run with coverage
npm run test:federation:coverage
```

### Watch Mode for Development

```bash
# Watch unit tests
npm run test:federation-governance:watch

# Watch integration tests
npm run test:federation-integration:watch
```

### Using Vitest Directly

```bash
# Run specific test file
npx vitest api/federation/__tests__/governance.test.ts

# Run with specific pattern
npx vitest api/federation/__tests__ --reporter=verbose

# Run with UI
npx vitest api/federation/__tests__ --ui
```

## Test Structure and Patterns

### Unit Test Structure

```typescript
describe("Federation Governance API", () => {
  // Setup and teardown
  beforeEach(() => {
    // Reset mocks and state
  });

  describe("Feature Group", () => {
    it("should test specific behavior", async () => {
      // Arrange
      const mockData = createMockData();

      // Act
      const result = await functionUnderTest(mockData);

      // Assert
      expect(result).toMatchExpectedStructure();
    });
  });
});
```

### Integration Test Structure

```typescript
describe("Federation Integration Tests", () => {
  beforeAll(async () => {
    // Setup test environment
    await setupTestFederation();
  });

  afterAll(async () => {
    // Cleanup test environment
    await cleanupTestFederation();
  });

  it("should test end-to-end workflow", async () => {
    // Test complete user journey
  });
});
```

## Test Categories

### 1. API Endpoint Tests

- Request/response validation
- Error handling
- Status code verification
- Response structure validation

### 2. Business Logic Tests

- Proposal validation
- Vote counting algorithms
- Consensus mechanisms
- Guardian management

### 3. Security Tests

- Authentication validation
- Authorization checks
- Signature verification
- Input sanitization

### 4. Performance Tests

- Response time validation
- Concurrent operation handling
- Large dataset processing
- Memory usage optimization

### 5. Error Handling Tests

- Network failure scenarios
- Invalid input handling
- Connection timeout handling
- Recovery mechanisms

## Mock Data and Fixtures

### Guardian Mock Data

```typescript
const mockGuardian = {
  id: "guardian_test_1",
  name: "Test Guardian 1",
  publicKey: "02test1234567890abcdef",
  status: "active",
  votingPower: 1,
  reputation: 95,
  familyRole: "parent",
  emergencyContacts: ["test@example.com"],
};
```

### Proposal Mock Data

```typescript
const mockProposal = {
  id: "prop_test_001",
  type: "spending_limit",
  title: "Test Proposal",
  description: "Test proposal description",
  proposer: "guardian_test_1",
  status: "pending",
  votesFor: 0,
  votesAgainst: 0,
  requiredVotes: 2,
  createdAt: new Date(),
  votingDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};
```

## Test Environment Setup

### Environment Variables

```env
NODE_ENV=test
FEDERATION_CONFIG=/tmp/test-federation.config
FEDERATION_NETWORK=testnet
GUARDIAN_PRIVATE_KEY=test_private_key
FEDERATION_PASSWORD=test_password
```

### Test Database

The tests use mock data and don't require a real database connection. However, for integration tests that need persistence, you can set up a test database:

```env
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/federation_test
```

## Assertion Patterns

### Structure Validation

```typescript
expect(response).toMatchObject({
  success: true,
  data: expect.objectContaining({
    federationId: expect.any(String),
    totalGuardians: expect.any(Number),
    guardians: expect.any(Array),
  }),
  meta: expect.objectContaining({
    timestamp: expect.any(String),
    demo: expect.any(Boolean),
  }),
});
```

### Array Validation

```typescript
expect(guardians).toBeInstanceOf(Array);
expect(guardians.length).toBeGreaterThan(0);

guardians.forEach((guardian) => {
  expect(guardian).toHaveProperty("id");
  expect(guardian).toHaveProperty("votingPower");
  expect(guardian.votingPower).toBeGreaterThan(0);
});
```

### Error Validation

```typescript
await expect(functionThatShouldFail()).rejects.toThrow(
  "Expected error message"
);
```

## Performance Benchmarks

### Response Time Expectations

- Governance status retrieval: < 100ms
- Proposal submission: < 200ms
- Vote casting: < 150ms
- Consensus calculation: < 50ms

### Concurrency Expectations

- Handle 10 concurrent requests without degradation
- Connection pool should manage 5+ simultaneous connections
- Vote processing should handle 100+ votes efficiently

## Coverage Goals

### Minimum Coverage Targets

- Unit tests: 90% line coverage
- Integration tests: 80% feature coverage
- Error scenarios: 95% error path coverage

### Coverage Reports

```bash
# Generate coverage report
npm run test:federation:coverage

# View coverage in browser
npx vitest --coverage --ui
```

## Debugging Tests

### Debug Mode

```bash
# Run tests with debug output
DEBUG=federation:* npm run test:federation:all

# Run single test with verbose output
npx vitest api/federation/__tests__/governance.test.ts --reporter=verbose
```

### Test Debugging Tips

1. Use `console.log` in tests for debugging (will be mocked in CI)
2. Use `it.only()` to run single tests during development
3. Use `describe.skip()` to temporarily disable test groups
4. Check mock call history with `expect(mockFn).toHaveBeenCalledWith()`

## Continuous Integration

### GitHub Actions Integration

```yaml
- name: Run Federation Tests
  run: |
    npm run test:federation:all
    npm run test:federation:coverage
```

### Test Reporting

Tests generate JUnit XML reports for CI integration and coverage reports in multiple formats (HTML, JSON, LCOV).

## Contributing to Tests

### Adding New Tests

1. Follow existing naming conventions
2. Use descriptive test names that explain the behavior
3. Include both positive and negative test cases
4. Add performance tests for new features
5. Update mock data as needed

### Test Review Checklist

- [ ] Tests cover happy path scenarios
- [ ] Tests cover error scenarios
- [ ] Tests include edge cases
- [ ] Mock data is realistic
- [ ] Performance expectations are reasonable
- [ ] Tests are deterministic (no flaky tests)
- [ ] Tests clean up after themselves

## Troubleshooting

### Common Issues

#### Tests Timing Out

- Increase timeout in vitest config
- Check for unresolved promises
- Ensure proper cleanup in afterEach/afterAll

#### Mock Issues

- Verify mock setup in beforeEach
- Check mock reset/restore calls
- Ensure mocks match actual API

#### Coverage Issues

- Check for untested code paths
- Add tests for error scenarios
- Verify test file patterns in config

### Getting Help

- Check existing test patterns in the codebase
- Review Vitest documentation
- Ask team members for guidance on complex scenarios

---

This test suite serves as both functional validation and documentation of expected behavior for the Federation Governance API. The tests should be maintained and updated as the API evolves.
