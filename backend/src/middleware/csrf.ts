import { Request, Response, NextFunction } from 'express';

// Double-submit-cookie CSRF protection for cookie-authenticated sessions.
// - Requests authenticated with an Authorization header (API clients / tests)
//   are exempt: they carry their own bearer token and are not vulnerable to
//   browser-driven CSRF.
// - Safe methods are exempt.
// - Otherwise the `X-CSRF-Token` header must match the non-HttpOnly `csrf_token`
//   cookie set during login. Combined with SameSite=Lax cookies this is robust
//   defense-in-depth against cross-site request forgery.
export const csrfProtect = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.header('Authorization')) return next();

  const cookieCsrf = req.cookies?.csrf_token as string | undefined;
  const headerCsrf = req.header('X-CSRF-Token');

  if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  next();
};