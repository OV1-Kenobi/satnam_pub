// Simple test to demonstrate the federation API validation
const testCases = [
  {
    name: "Valid create federation request",
    data: {
      action: "create",
      name: "Test Federation",
      description: "A test federation",
      guardianUrls: [
        "https://guardian1.example.com",
        "https://guardian2.example.com",
      ],
      threshold: 2,
    },
    expectedStatus: 200,
  },
  {
    name: "Missing required fields",
    data: {
      action: "create",
      // Missing name, guardianUrls, threshold
    },
    expectedStatus: 400,
  },
  {
    name: "Invalid guardian URLs",
    data: {
      action: "create",
      name: "Test Federation",
      guardianUrls: ["not-a-url", "also-not-a-url"],
      threshold: 1,
    },
    expectedStatus: 400,
  },
  {
    name: "Threshold exceeds guardian count",
    data: {
      action: "create",
      name: "Test Federation",
      guardianUrls: ["https://guardian1.example.com"],
      threshold: 5,
    },
    expectedStatus: 400,
  },
  {
    name: "Valid join federation request",
    data: {
      action: "join",
      inviteCode: "valid-invite-code-123",
    },
    expectedStatus: 200,
  },
  {
    name: "Missing invite code",
    data: {
      action: "join",
    },
    expectedStatus: 400,
  },
  {
    name: "Invalid action",
    data: {
      action: "invalid-action",
    },
    expectedStatus: 400,
  },
];

async function testFederationAPI() {
  console.log("🧪 Testing Federation API Validation\n");

  const baseUrl = "http://localhost:3000/api/fedimint/federation";

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testCase.data),
      });

      const result = await response.json();

      if (response.status === testCase.expectedStatus) {
        console.log(`✅ PASS: Expected status ${testCase.expectedStatus}`);
      } else {
        console.log(
          `❌ FAIL: Expected ${testCase.expectedStatus}, got ${response.status}`,
        );
      }

      if (response.status === 400 && result.details) {
        console.log(`   Validation errors:`, result.details);
      }

      console.log(`   Response:`, result);
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }

    console.log("");
  }
}

// Export for use with Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { testFederationAPI };
} else {
  // Run tests if this file is executed directly
  testFederationAPI();
}
