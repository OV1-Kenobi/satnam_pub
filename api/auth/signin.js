// api/auth/signin.js - BROWSER COMPATIBLE
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;

  // Mock authentication
  if (username && password) {
    const session = {
      user: {
        id: crypto.randomUUID(),
        username,
        role: 'parent'
      },
      token: crypto.randomUUID(),
      authenticated: true
    };
    res.status(200).json(session);
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}