/**
 * Database Migration Script
 * Runs the schema.sql file to set up the database
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  console.log('Starting database migration...\n');

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('Please set DATABASE_URL in your .env file');
    process.exit(1);
  }

  // Create connection pool
  // Enable SSL for Render databases (they always require it)
  const isRenderDb = process.env.DATABASE_URL?.includes('render.com');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.NODE_ENV === 'production' || isRenderDb)
      ? { rejectUnauthorized: false } 
      : undefined,
  });

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    // Read schema file
    const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.sql');
    console.log(`📖 Reading schema from: ${schemaPath}`);
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema
    console.log('🔨 Executing schema...');
    await pool.query(schema);
    console.log('✅ Schema executed successfully\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('✅ Tables created:');
    result.rows.forEach((row: { table_name: string }) => {
      console.log(`   - ${row.table_name}`);
    });

    // Create admin user if ADMIN_API_KEY is set
    const adminApiKey = process.env.ADMIN_API_KEY;
    if (adminApiKey) {
      console.log('\n👤 Creating admin user...');
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
      
      const adminResult = await pool.query(
        `INSERT INTO users (email, api_key) 
         VALUES ($1, $2) 
         ON CONFLICT (api_key) DO UPDATE SET email = EXCLUDED.email 
         RETURNING id, email`,
        [adminEmail, adminApiKey]
      );

      console.log('✅ Admin user created/updated:');
      console.log(`   Email: ${adminResult.rows[0].email}`);
      console.log(`   API Key: ${adminApiKey}`);
      console.log('\n💡 You can now connect to the MCP server using this API key!');
      
      // Use RENDER_EXTERNAL_URL if available, otherwise show placeholder
      const serverUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-server.onrender.com';
      console.log(`   Connection URL: ${serverUrl}/mcp/messages`);
      console.log(`   API Key (Bearer token): ${adminApiKey}`);
      console.log(`   OpenAI App MCP URL: ${serverUrl}/mcp/messages?api_key=${adminApiKey}`);
    } else {
      console.log('\n⚠️  No ADMIN_API_KEY set - no admin user created');
      console.log('   Set ADMIN_API_KEY to automatically create an admin user on deployment');
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate();

