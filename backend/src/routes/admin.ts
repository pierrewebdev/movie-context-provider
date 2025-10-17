/**
 * Admin Routes
 * Protected endpoints for administrative tasks
 */

import express from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * Middleware to verify ADMIN_API_KEY
 */
function requireAdminKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey) {
    res.status(503).json({ 
      error: 'Admin functionality disabled',
      message: 'ADMIN_API_KEY not configured'
    });
    return;
  }

  const providedKey = req.headers.authorization?.replace('Bearer ', '') || 
                       req.query.admin_key as string ||
                       req.body?.admin_key;

  if (providedKey !== adminKey) {
    res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid admin key'
    });
    return;
  }

  next();
}

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `moviemcp_${timestamp}_${randomPart}`;
}

/**
 * Request schema for creating a user
 */
const CreateUserSchema = z.object({
  email: z.string().email('Valid email required'),
  api_key: z.string().optional(),
});

/**
 * POST /admin/create-user
 * Creates a new user with an API key
 */
router.post('/create-user', requireAdminKey, async (req, res): Promise<void> => {
  try {
    const validated = CreateUserSchema.parse(req.body);
    const apiKey = validated.api_key || generateApiKey();

    const result = await query<{ id: number; email: string; api_key: string }>(
      `INSERT INTO users (email, api_key) 
       VALUES ($1, $2) 
       ON CONFLICT (api_key) DO UPDATE SET email = EXCLUDED.email 
       RETURNING id, email, api_key`,
      [validated.email, apiKey]
    );

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        apiKey: user.api_key,
      },
      message: 'User created successfully. Save this API key securely!',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors 
      });
      return;
    }
    
    console.error('Error creating user:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /admin/users
 * Lists all users (email and ID only, no API keys)
 */
router.get('/users', requireAdminKey, async (_req, res) => {
  try {
    const result = await query<{ id: number; email: string; created_at: Date }>(
      'SELECT id, email, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      users: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ 
      error: 'Failed to list users',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /admin/health
 * Check admin endpoint health
 */
router.get('/health', requireAdminKey, (_req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin endpoints operational',
    timestamp: new Date().toISOString(),
  });
});

export default router;

