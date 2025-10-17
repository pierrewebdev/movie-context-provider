/**
 * Helper script to generate a secure API key
 * Use this when creating new users
 */

import { randomBytes } from 'crypto';

function generateApiKey(prefix = 'key'): string {
  // Generate 32 random bytes and convert to hex
  const randomPart = randomBytes(32).toString('hex');
  const timestamp = Date.now().toString(36);
  
  return `${prefix}_${timestamp}_${randomPart}`;
}

// Generate and display a new API key
const apiKey = generateApiKey('moviemcp');
console.log('\n🔑 Generated API Key:');
console.log(apiKey);
console.log('\n📝 To create a user with this key, run:');
console.log(`psql $DATABASE_URL -c "INSERT INTO users (email, api_key) VALUES ('user@example.com', '${apiKey}');"`);
console.log('\n⚠️  Store this key securely - it cannot be recovered!\n');

