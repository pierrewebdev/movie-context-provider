import { query } from '../src/db/client.js';
import { getMovieDetails as fetchMovieDetails } from '../src/utils/tmdb.js';

async function addRatingColumn() {
  console.log('Adding rating column to movies table...');
  
  // Add the column
  await query(`
    ALTER TABLE movies 
    ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1)
  `);
  
  console.log('✅ Rating column added');
  
  // Update existing movies with ratings from TMDB
  console.log('Fetching ratings for existing movies...');
  
  const result = await query<{ id: number; tmdb_id: number; title: string }>(
    'SELECT id, tmdb_id, title FROM movies WHERE rating IS NULL'
  );
  
  console.log(`Found ${result.rows.length} movies without ratings`);
  
  for (const movie of result.rows) {
    try {
      const details = await fetchMovieDetails(movie.tmdb_id);
      await query(
        'UPDATE movies SET rating = $1 WHERE id = $2',
        [details.rating, movie.id]
      );
      console.log(`Updated ${movie.title}: ${details.rating}/10`);
    } catch (error) {
      console.error(`Failed to update ${movie.title}:`, error instanceof Error ? error.message : error);
    }
  }
  
  console.log('✅ Migration complete!');
  process.exit(0);
}

addRatingColumn().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});


