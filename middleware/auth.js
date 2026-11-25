// middleware/auth.js - protects routes that need a logged-in user.

// For JSON API routes: answer 401 so the frontend can redirect to sign-in.
export function requireAuthApi(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Please sign in first.' });
}

// For HTML pages: redirect straight to the sign-in page.
export function requireAuthPage(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/signin');
}

// For sign-in / sign-up pages: if already logged in, skip to the app.
export function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.userId) return res.redirect('/app');
  return next();
}
