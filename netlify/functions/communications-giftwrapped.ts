// Hyphen-name Netlify Function for /api/communications/giftwrapped
// Delegates to the ESM handler implemented in api/communications/giftwrapped.js

import giftwrapped from "../api/communications/giftwrapped.js";

export const handler = giftwrapped as any;

