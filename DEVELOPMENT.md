# Development Environment Setup

This document explains how to run the development environment for both frontend development and full-stack testing with Netlify Functions.

## Development Modes

### 1. Frontend-Only Development (Recommended for UI work)

```bash
npm run dev
# or
npm run dev:frontend-only
```

**Use this when:**

- Working on UI components
- Styling and layout changes
- Frontend logic that doesn't require API calls
- **No MIME type issues** - modules load correctly

**Limitations:**

- API endpoints (`/api/*`) will return 404
- Identity registration and other backend features won't work

### 2. Full-Stack Development (For API testing)

```bash
npm run dev:functions
```

**Use this when:**

- Testing identity registration
- Working with Netlify Functions
- End-to-end feature testing
- API development

**Known Issues:**

- ⚠️ **MIME type errors may occur** due to Netlify Dev proxy interference (development only - does NOT affect production)
- Deprecation warnings from Netlify CLI (harmless but noisy)
- Slower startup time

## Troubleshooting MIME Type Issues

If you encounter MIME type errors when running `npm run dev:functions`:

1. **Try refreshing the browser** - Sometimes the first load fails but subsequent loads work
2. **Clear browser cache** - Hard refresh (Ctrl+F5 or Cmd+Shift+R)
3. **Switch to frontend-only mode** for UI development:
   ```bash
   # Kill the current server (Ctrl+C)
   npm run dev:frontend-only
   ```

## File Structure Notes

- **Frontend modules**: All `.ts/.tsx` files in `src/` are handled by Vite
- **API functions**: All `.js` files in `netlify/functions/` are handled by Netlify Dev
- **Mixed imports fixed**: Circular dependencies between `.js` and `.ts` files have been resolved

## Environment Variables

Both development modes use the same environment variables from:

- `.env` - Non-sensitive configuration
- `.env.local` - Local overrides (not in git)

## Testing Identity Registration

To test the complete identity registration flow:

1. Start full-stack mode: `npm run dev:functions`
2. Wait for "Loaded function register-identity" message
3. Navigate to the Identity Forge in the UI
4. If MIME errors occur, refresh the browser

## Production Deployment

The production build always works correctly:

```bash
npm run build
```

Netlify automatically handles the correct MIME types in production.
