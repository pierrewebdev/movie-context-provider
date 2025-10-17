/**
 * MCP Transport Configuration
 * Handles HTTP streaming transport setup and MCP endpoint routing
 */

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TRANSPORT_CONFIG, ENDPOINTS } from '../config/constants.js';
import { authenticateApiKey } from '../middleware/auth.js';

/**
 * Create and configure MCP transport
 */
export function createTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: TRANSPORT_CONFIG.sessionIdGenerator,
    enableJsonResponse: TRANSPORT_CONFIG.enableJsonResponse,
  });
}

/**
 * Register MCP endpoint on Express app
 * Supports both GET (session establishment) and POST (JSON-RPC messages)
 */
export function registerMCPEndpoint(
  app: express.Application,
  transport: StreamableHTTPServerTransport
): void {
  const mcpHandler = async (req: express.Request, res: express.Response) => {
    console.log(`🔌 MCP ${req.method} request from: ${req.userEmail}, Method: ${req.body?.method || 'session'}`);

    try {
      // Expose authenticated user info so transport passes it through extra.authInfo
      (req as any).auth = {
        userId: req.userId,
        email: req.userEmail,
      };

      // Let the transport handle the request
      // It manages sessions, message routing, etc. internally
      await transport.handleRequest(req as any, res, req.body);
    } catch (error) {
      console.error('❌ Error in MCP endpoint:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process MCP request' });
      }
    }
  };

  // GET endpoint for session establishment
  app.get(ENDPOINTS.mcp, authenticateApiKey, mcpHandler);

  // POST endpoint for JSON-RPC messages
  app.post(ENDPOINTS.mcp, authenticateApiKey, mcpHandler);
}

/**
 * Connect MCP server to transport
 */
export async function connectServerToTransport(
  mcpServer: Server,
  transport: StreamableHTTPServerTransport
): Promise<void> {
  await mcpServer.connect(transport);
  console.log('✅ MCP server connected to transport');
}

