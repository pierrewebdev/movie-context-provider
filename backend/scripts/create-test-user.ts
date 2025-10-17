/**
 * Script to create a test user with API key
 * Usage: tsx scripts/create-test-user.ts <email> <api_key>
 */

import dotenv from 'dotenv';
import { query, closePool } from '../src/db/client.js';

dotenv.config();

async function createTestUser() {
  const email = process.argv[2];
  const apiKey = process.argv[3];

  if (!email || !apiKey) {
    console.error('❌ Usage: tsx scripts/create-test-user.ts <email> <api_key>');
    process.exit(1);
  }

  try {
    console.log(`Creating user: ${email}`);
    
    const result = await query<{ id: number; email: string; api_key: string }>(
      `INSERT INTO users (email, api_key) 
       VALUES ($1, $2) 
       ON CONFLICT (api_key) DO UPDATE SET email = EXCLUDED.email 
       RETURNING id, email, api_key`,
      [email, apiKey]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('✅ User created/updated successfully:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   API Key: ${user.api_key}`);
    }
  } catch (error) {
    console.error('❌ Failed to create user:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

createTestUser();

