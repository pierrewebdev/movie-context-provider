/**
 * Database client with connection pooling and transaction support
 * Uses parameterized queries to prevent SQL injection
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create connection pool with SSL support for Render
// SSL is automatically enabled for Render databases (they always require it)
const isRenderDb = process.env.DATABASE_URL?.includes('render.com');
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' || isRenderDb)
    ? { rejectUnauthorized: false } 
    : undefined,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection not available
});

// Handle pool errors
pool.on('error', (err: Error) => {
  console.error('Unexpected database error:', err);
});

/**
 * Execute a query with automatic connection management
 * Uses parameterized queries for security
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string, 
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (over 1 second) for performance monitoring
    if (duration > 1000) {
      console.warn('Slow query detected:', { text, duration, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    console.error('Database query error:', { text, error });
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 * Automatically rolls back on error
 * 
 * Example usage:
 * await transaction(async (client) => {
 *   await client.query('INSERT INTO movies ...');
 *   await client.query('INSERT INTO watchlist ...');
 * });
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error, rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 * Useful for health checks and startup validation
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    if (process.env.NODE_ENV !== 'production') {
      console.log('Database connected successfully:', result.rows[0]);
    }
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Close all connections in the pool
 * Should be called on application shutdown
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database connection pool closed');
}

