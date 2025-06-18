// examples/username-registration-examples.ts
/**
 * Examples of how to use the new username choice system
 */

import { IdentityRegistration } from "../lib/api/register-identity";

// Example 1: User wants to choose their own username
async function registerWithCustomUsername() {
  const registrationResult = await IdentityRegistration.registerIdentity({
    userId: "user-123",
    username: "MyChosenUsername",
    usernameChoice: "user_provided", // Explicit choice to provide own username
    userEncryptionKey: "user-supplied-passphrase",
    optionalData: {
      displayName: "John Doe",
      bio: "Bitcoin enthusiast",
    },
    makeDiscoverable: true,
  });

  if (registrationResult.success) {
    console.log("✅ Registration successful with custom username");
    console.log("Username:", registrationResult.profile?.username);
  } else {
    console.error("❌ Registration failed:", registrationResult.error);
  }
}

// Example 2: User wants a suggested username
async function registerWithSuggestedUsername() {
  const registrationResult = await IdentityRegistration.registerIdentity({
    userId: "user-456",
    // No username provided - will be generated
    usernameChoice: "generate_suggestion", // Explicit choice to generate username
    userEncryptionKey: "user-supplied-passphrase",
    optionalData: {
      displayName: "Jane Smith",
    },
    makeDiscoverable: false,
  });

  if (registrationResult.success) {
    console.log("✅ Registration successful with generated username");
    console.log("Generated username:", registrationResult.profile?.username);
  } else {
    console.error("❌ Registration failed:", registrationResult.error);
  }
}

// Example 3: Get username suggestions first, then let user choose
async function getSuggestionsAndRegister() {
  // Step 1: Get suggestions
  const suggestions = await IdentityRegistration.generateUsernameSuggestions({
    userId: "user-789",
    count: 5,
  });

  if (suggestions.success && suggestions.suggestions) {
    console.log("Available username suggestions:");
    suggestions.suggestions.forEach((suggestion, index) => {
      console.log(`${index + 1}. ${suggestion}`);
    });

    // Step 2: User selects one of the suggestions (or types their own)
    const selectedUsername = suggestions.suggestions[0]; // User picks first one

    // Step 3: Register with the chosen username
    const registrationResult = await IdentityRegistration.registerIdentity({
      userId: "user-789",
      username: selectedUsername,
      usernameChoice: "user_provided", // User chose from suggestions
      userEncryptionKey: "user-supplied-passphrase",
      makeDiscoverable: true,
    });

    if (registrationResult.success) {
      console.log("✅ Registration successful with selected username");
      console.log("Final username:", registrationResult.profile?.username);
    }
  }
}

// Example 4: Frontend implementation pattern
class UsernameSelectionUI {
  static async showUsernameOptions(userId: string) {
    return {
      // Option 1: Custom username input
      customUsernameSection: {
        title: "Choose Your Own Username",
        description:
          "Pick a memorable username (3-20 characters, letters, numbers, _ and - allowed)",
        inputField: "text",
        validation: "real-time availability checking",
        submitWith: { usernameChoice: "user_provided" },
      },

      // Option 2: Suggested usernames
      suggestedUsernameSection: {
        title: "Or Pick From Suggestions",
        description: "We'll generate some unique, available usernames for you",
        loadSuggestions: async () => {
          const suggestions =
            await IdentityRegistration.generateUsernameSuggestions({
              userId,
              count: 5,
            });
          return suggestions.success ? suggestions.suggestions : [];
        },
        submitWith: { usernameChoice: "user_provided" }, // User selected from suggestions
      },

      // Option 3: Random assignment
      randomUsernameSection: {
        title: "Surprise Me!",
        description: "Generate a random username automatically",
        button: "Generate Random Username",
        submitWith: { usernameChoice: "generate_suggestion" },
      },
    };
  }
}

export {
  getSuggestionsAndRegister,
  registerWithCustomUsername,
  registerWithSuggestedUsername,
  UsernameSelectionUI,
};
