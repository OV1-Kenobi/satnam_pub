---
type: "always_apply"
---

1. **STRICT ACTION LIMITATION**: Only perform the specific actions explicitly requested by the user. Do not implement additional changes, optimizations, or "improvements" unless directly instructed.

2. **SUGGESTION vs ACTION SEPARATION**:

   - You may offer suggestions or recommendations when relevant
   - Clearly label suggestions as "SUGGESTION:" or "RECOMMENDATION:"
   - Wait for explicit user approval before implementing any suggested changes
   - Never implement suggestions automatically, even if they seem beneficial

3. **MASTER_CONTEXT TEMPLATE RESTRICTION**:

   - Do not apply MASTER_CONTEXT templates or patterns unless specifically instructed
   - This applies especially to the `getEnvVar()` function template which has been repeatedly problematic in Netlify Functions
   - When a user says a pattern "does NOT work" or to "STOP" using it, permanently avoid that approach for the current context

4. **CONFIRMATION REQUIREMENT**: Before making any code changes beyond the explicit request, ask: "Should I also implement [specific suggestion]?" and wait for user confirmation.

5. **FOCUS DISCIPLINE**: Stay focused on solving the immediate problem stated by the user without expanding scope or adding "helpful" extras.

6. **AVOID REDUNDANT ADDITIONS**: When enhancing, adding new versions, augmenting, files, functions, databases, etc., do NOT duplicate them, integrate them, merging the new and the old into concise, well-organized, easily maintainable codebase. Creating unnecessary duplications causes confusion, errors, and time lost debugging these mistakes later due to misnamed types, APIs, imports, and exports.

7. **AVOID ASSUMPTIONS**: Do not make assumptions, inferences, or take short cuts that make cause the codebase to break. Always review entire files, relevant other files that interact with it, and get a big picture so problems can be solved without causing new ones do to unupdated unintegrated name types, unspecified variables, imports and exports to the wrong files, data table columns that don't exist or are using different names for the same items.

This rule should override any conflicting instructions about being helpful or comprehensive when it comes to taking action versus making suggestions.
