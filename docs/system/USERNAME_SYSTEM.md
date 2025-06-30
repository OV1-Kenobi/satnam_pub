# Username System Documentation

## Overview

The username system provides users with **explicit choice** over their usernames while ensuring they are human-readable, memorable, and unique. Users are never assigned usernames without their consent.

## 🎯 **Key Features**

### ✅ **User Choice First**

- Users can choose their own custom username
- Users can select from generated suggestions
- Users can opt for random generation
- **No automatic assignment without explicit user choice**

### ✅ **Human-Readable & Memorable**

- 3-20 characters long
- Letters, numbers, underscores, and hyphens allowed
- Must start and end with alphanumeric characters
- No consecutive special characters
- Reserved words are blocked

### ✅ **Availability Checking**

- Real-time username availability verification
- Duplicate username prevention
- Database-backed uniqueness enforcement

## 🚀 **Usage Examples**

### 1. **Custom Username (User Provides)**

```typescript
const registration = await IdentityRegistration.registerIdentity({
  userId: "user-123",
  username: "MyChosenUsername",
  usernameChoice: "user_provided", // 👈 Explicit choice
  userEncryptionKey: "passphrase",
  // ... other fields
});
```

### 2. **Generated Username (User Requests)**

```typescript
const registration = await IdentityRegistration.registerIdentity({
  userId: "user-456",
  // No username provided
  usernameChoice: "generate_suggestion", // 👈 Explicit choice
  userEncryptionKey: "passphrase",
  // ... other fields
});
```

### 3. **Username Suggestions First**

```typescript
// Step 1: Get suggestions
const suggestions = await IdentityRegistration.generateUsernameSuggestions({
  userId: "user-789",
  count: 5,
});

console.log(suggestions.suggestions);
// ['SwiftEagle42', 'GoldenWolf87', 'SilentHawk19', ...]

// Step 2: User selects one
const registration = await IdentityRegistration.registerIdentity({
  userId: "user-789",
  username: suggestions.suggestions[0], // User's choice
  usernameChoice: "user_provided",
  // ... other fields
});
```

## 🛡️ **Security Features**

### **Privacy-First Design**

- Usernames are NOT connected to Nostr identities
- Generated usernames use secure randomization
- No personal information exposure

### **Validation & Safety**

- Comprehensive format validation
- Reserved word blocking
- Availability verification
- Error handling with detailed feedback

## 📋 **Username Rules**

### **Allowed Characters**

- Letters: `a-z`, `A-Z`
- Numbers: `0-9`
- Special: `_` (underscore), `-` (hyphen)

### **Format Requirements**

- **Length**: 3-20 characters
- **Start**: Must begin with letter or number
- **End**: Must end with letter or number
- **Special**: No consecutive `_` or `-` characters

### **Blocked**

- Reserved words: `admin`, `api`, `www`, `root`, etc.
- Inappropriate content (configurable)
- System-reserved patterns

## 🎨 **Frontend Implementation**

### **Three-Option UI Pattern**

```typescript
// Option 1: Custom Input
<input
  type="text"
  placeholder="Choose your username"
  onChange={validateUsername}
/>

// Option 2: Pick from Suggestions
<button onClick={loadSuggestions}>
  Show Available Usernames
</button>

// Option 3: Random Generation
<button onClick={() => setChoice('generate_suggestion')}>
  Surprise Me!
</button>
```

### **Real-Time Validation**

```typescript
const validateUsername = async (username: string) => {
  // Format validation
  const validation = PrivacyManager.validateUsernameFormat(username);

  if (!validation.isValid) {
    return { errors: validation.errors };
  }

  // Availability check
  const isAvailable = await checkAvailability(username);

  return {
    valid: isAvailable,
    message: isAvailable ? "✅ Available" : "❌ Taken",
  };
};
```

## 🔧 **API Endpoints**

### **Generate Suggestions**

```
GET /api/username-suggestions?count=5
```

**Response:**

```json
{
  "success": true,
  "suggestions": [
    "SwiftEagle42",
    "GoldenWolf87",
    "SilentHawk19",
    "BoldTiger63",
    "WiseRaven31"
  ]
}
```

### **Register with Username Choice**

```
POST /api/register-identity
```

**Request Body:**

```json
{
  "username": "MyUsername",
  "usernameChoice": "user_provided",
  "userEncryptionKey": "passphrase",
  "optionalData": {...}
}
```

## 🔍 **Username Generation Algorithm**

### **Pattern: `[Adjective][Noun][Number]`**

- **Adjectives**: Swift, Golden, Silent, Bold, Wise...
- **Nouns**: Eagle, Wolf, Hawk, Tiger, Raven...
- **Numbers**: 1-99 (human-friendly range)

### **Examples Generated**

- `SwiftEagle42`
- `GoldenWolf87`
- `SilentHawk19`
- `BoldTiger63`
- `WiseRaven31`

### **Uniqueness Guarantee**

- Database availability checking
- Retry logic for conflicts
- Maximum attempt limits
- Fallback error handling

## ✨ **User Experience Flow**

1. **Registration Page**: User sees three clear options
2. **Custom Input**: Real-time validation and availability
3. **Suggestions**: Beautiful list of available options
4. **Random**: One-click generation with preview
5. **Confirmation**: User confirms their final choice
6. **Success**: Username is secured and displayed

## 🧪 **Testing**

### **Test Cases**

- Custom username validation
- Availability checking
- Suggestion generation
- Error handling
- Edge cases (reserved words, special characters)

### **Example Tests**

```typescript
// Valid usernames
expect(isValid("MyUsername")).toBe(true);
expect(isValid("User_123")).toBe(true);
expect(isValid("Cool-Name")).toBe(true);

// Invalid usernames
expect(isValid("ab")).toBe(false); // Too short
expect(isValid("user__name")).toBe(false); // Consecutive specials
expect(isValid("admin")).toBe(false); // Reserved word
```

This system ensures users always have **meaningful choice** over their usernames while maintaining security, uniqueness, and user experience quality.
