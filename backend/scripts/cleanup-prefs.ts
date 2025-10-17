import { query } from '../src/db/client.js';

async function cleanup() {
  console.log('Cleaning up duplicate preference keys...');
  
  // Delete the old singular key
  await query('DELETE FROM preferences WHERE key = $1', ['favorite_director']);
  
  console.log('✅ Removed old "favorite_director" key');
  console.log('✅ Kept "favorite_directors" array');
  
  // Show current state
  const result = await query('SELECT key, value FROM preferences WHERE user_id = 3 ORDER BY key');
  console.log('\nCurrent preferences:');
  for (const row of result.rows) {
    console.log(`- ${row.key}:`, row.value);
  }
  
  process.exit(0);
}

cleanup().catch(console.error);
