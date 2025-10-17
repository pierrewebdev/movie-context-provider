/**
 * Movie MCP Server
 * Main entry point - Bootstrap and server initialization
 */


import express from 'express';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { testConnection, closePool } from './db/client.js';
import { validateEnv, SERVER_INFO, ENDPOINTS, type Env } from './config/constants.js';
import { MOVIE_POSTER_WIDGET_URL } from './utils/config.js';
import { healthCheckHandler } from './routes/health.js';
import { rootHandler } from './routes/root.js';
import { registerMCPHandlers } from './server/mcp-handlers.js';
import adminRouter from './routes/admin.js';
import {
  createTransport,
  registerMCPEndpoint,
  connectServerToTransport,
} from './server/transport.js';

// Load environment variables
dotenv.config();

// Validate environment variables on startup
let env: Env;
try {
  env = validateEnv();
  console.log('✅ Environment validation passed');
} catch (error) {
  console.error('❌ Failed to start: Invalid environment configuration');
  process.exit(1);
}

// Check widget configuration
if (!MOVIE_POSTER_WIDGET_URL) {
  console.warn('[Config] MOVIE_POSTER_WIDGET_URL not set. Apps SDK widget will not render for movie details.');
}

const PORT = env.PORT;

/**
 * Create and configure Express app
 */
function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  // Register routes
  app.get(ENDPOINTS.health, healthCheckHandler);
  app.get(ENDPOINTS.root, rootHandler);
  app.use('/admin', adminRouter);

  // Error handling middleware
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Create and configure MCP server
 */
function createMCPServer(): Server {
  const mcpServer = new Server(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register all MCP protocol handlers
  registerMCPHandlers(mcpServer);

  return mcpServer;
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Test database connection
    console.log('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    // Create Express app and MCP server
    const app = createApp();
    const mcpServer = createMCPServer();

    // Create transport and connect to MCP server
    const transport = createTransport();
    await connectServerToTransport(mcpServer, transport);

    // Register MCP endpoint on Express app
    registerMCPEndpoint(app, transport);

    // Start Express server
    app.listen(PORT, () => {
      console.log(`${SERVER_INFO.name} v${SERVER_INFO.version} running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}${ENDPOINTS.health}`);
      console.log(`MCP endpoint: http://localhost:${PORT}${ENDPOINTS.mcp}`);
      console.log('Ready to accept connections!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown() {
  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Bootstrap
setupGracefulShutdown();
startServer();
