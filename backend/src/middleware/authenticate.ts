import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header('Authorization');

  // Support both the Bearer header (API clients) and the HttpOnly access-token
  // cookie (browser sessions).
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace(/^Bearer\s+/, '').trim();
  } else if (req.cookies?.token) {
    token = req.cookies.token as string;
  }

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token expired, please login again' });
    }
    // Invalid signature, malformed token, etc. — always 401 for auth failures.
    return res.status(401).json({ message: 'Invalid token.' });
  }
};