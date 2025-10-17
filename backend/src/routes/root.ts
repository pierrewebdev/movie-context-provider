/**
 * Root endpoint
 */

import express from 'express';
import { SERVER_INFO, ENDPOINTS } from '../config/constants.js';

/**
 * Root route handler
 * Returns server info and available endpoints
 */
export function rootHandler(
  _req: express.Request,
  res: express.Response
): void {
  res.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    description: SERVER_INFO.description,
    endpoints: {
      health: ENDPOINTS.health,
      mcp: ENDPOINTS.mcp,
    },
  });
}


