/**
 * Health check endpoint
 */

import express from 'express';
import { testConnection } from '../db/client.js';

/**
 * Health check route
 * Returns database connection status and timestamp
 */
export async function healthCheckHandler(
  _req: express.Request,
  res: express.Response
): Promise<void> {
  const dbConnected = await testConnection();
  
  res.json({
    status: 'ok',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
}


