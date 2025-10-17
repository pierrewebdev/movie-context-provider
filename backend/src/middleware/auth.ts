/**
 * Authentication middleware for API key-based user identification
 * 
 * This is a basic authentication system suitable for demos and prototypes.
 * For production use, consider:
 * - JWT tokens with expiration
 * - OAuth 2.0 integration
 * - Rate limiting per user
 * - Password-based authentication
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../db/client.js';

// Extend Express Request type to include authenticated user
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
    }
  }
}

/**
 * Middleware to authenticate requests via API key
 * Expects API key in Authorization header: "Bearer YOUR_API_KEY"
 * Sets req.userId and req.userEmail on successful authentication
 */
export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      res.status(401).json({
        error: 'Missing credentials',
        message: 'Provide API key via Authorization header, ?api_key query param, or request body.',
      });
      return;
    }

    // Look up user by API key
    const result = await query<{ id: number; email: string }>(
      'SELECT id, email FROM users WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ 
        error: 'Invalid API key',
        message: 'The provided API key does not match any user'
      });
      return;
    }

    // Set user info on request object
    const user = result.rows[0];
    req.userId = user.id;
    req.userEmail = user.email;

    // Continue to next middleware
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
}

function extractApiKey(req: Request): string | undefined {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
      return parts[1];
    }
  }

  const queryToken = req.query.api_key;
  if (typeof queryToken === 'string') {
    const token = queryToken.trim();
    if (token !== '') return token;
  } else if (Array.isArray(queryToken)) {
    const token = queryToken.find((value) => typeof value === 'string' && value.trim() !== '');
    if (typeof token === 'string') {
      return token.trim();
    }
  }

  const bodyToken =
    typeof req.body === 'object' && req.body !== null
      ? (req.body.api_key as string | undefined) ??
        (req.body.auth?.token as string | undefined) ??
        (req.body.token as string | undefined)
      : undefined;

  if (bodyToken && bodyToken.trim() !== '') {
    return bodyToken.trim();
  }

  return undefined;
}

/**
 * Helper function to create a new user with API key
 * This is for testing and development purposes
 * In production, implement proper user registration with secure key generation
 */
export async function createUser(email: string, apiKey?: string): Promise<{ 
  id: number; 
  email: string; 
  apiKey: string; 
}> {
  // Generate a random API key if not provided
  const generatedKey = apiKey || `key_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  const result = await query<{ id: number; email: string; api_key: string }>(
    'INSERT INTO users (email, api_key) VALUES ($1, $2) RETURNING id, email, api_key',
    [email, generatedKey]
  );

  const user = result.rows[0];
  
  return {
    id: user.id,
    email: user.email,
    apiKey: user.api_key,
  };
}

/**
 * Helper to get user by ID
 */
export async function getUserById(userId: number): Promise<{
  id: number;
  email: string;
  createdAt: Date;
} | null> {
  const result = await query<{ id: number; email: string; created_at: Date }>(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

