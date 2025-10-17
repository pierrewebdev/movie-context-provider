/**
 * Database Utilities
 * Reusable database operations and type-safe row mappers
 */

import pg from 'pg';
import { getMovieDetails as fetchMovieDetailsFromTMDB } from '../utils/tmdb.js';

/**
 * Movie record in database
 */
export interface MovieRecord {
  id: number;
  tmdb_id: number;
  title: string;
  year: number | null;
  overview: string;
  poster_url: string | null;
  rating: number | null;
  created_at: Date;
}

/**
 * Watchlist record with movie details
 */
export interface WatchlistRecord {
  tmdb_id: number;
  title: string;
  year: number | null;
  overview: string;
  poster_url: string | null;
  rating: number | null; // TMDB rating
  notes: string | null;
  added_at: Date;
}

/**
 * Watched record with movie details
 */
export interface WatchedRecord {
  tmdb_id: number;
  title: string;
  year: number | null;
  overview: string;
  poster_url: string | null;
  rating: number | null; // TMDB rating
  userRating: number; // User's rating
  notes: string | null;
  watched_at: Date;
}

/**
 * Type-safe row mapper for watchlist records
 * Handles DECIMAL to number conversion for ratings
 */
export function mapWatchlistRow(row: any): WatchlistRecord {
  return {
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    overview: row.overview,
    poster_url: row.poster_url,
    rating: row.rating ? Number(row.rating) : null, // Convert DECIMAL to number
    notes: row.notes,
    added_at: row.added_at,
  };
}

/**
 * Type-safe row mapper for watched records
 * Handles DECIMAL to number conversion and separates TMDB rating from user rating
 */
export function mapWatchedRow(row: any): WatchedRecord {
  return {
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    overview: row.overview,
    poster_url: row.poster_url,
    rating: row.tmdb_rating ? Number(row.tmdb_rating) : null, // TMDB rating
    userRating: row.user_rating, // User's rating
    notes: row.notes,
    watched_at: row.watched_at,
  };
}

/**
 * Ensure a movie exists in the database
 * Fetches from TMDB if not found and inserts it
 * 
 * @param client - PostgreSQL client (for transaction support)
 * @param tmdb_id - TMDB movie ID
 * @returns Database movie ID
 * 
 * @example
 * ```ts
 * const movieId = await ensureMovieExists(client, 550); // Fight Club
 * ```
 */
export async function ensureMovieExists(
  client: pg.PoolClient,
  tmdb_id: number
): Promise<number> {
  // Check if movie already exists
  const movieCheck = await client.query<{ id: number }>(
    'SELECT id FROM movies WHERE tmdb_id = $1',
    [tmdb_id]
  );

  if (movieCheck.rows.length > 0) {
    return movieCheck.rows[0].id;
  }

  // Fetch movie details from TMDB
  const movieDetails = await fetchMovieDetailsFromTMDB(tmdb_id);

  // Insert movie into database
  const insertResult = await client.query<{ id: number }>(
    `INSERT INTO movies (tmdb_id, title, year, overview, poster_url, rating)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      movieDetails.tmdb_id,
      movieDetails.title,
      movieDetails.year,
      movieDetails.overview,
      movieDetails.poster_url,
      movieDetails.rating,
    ]
  );

  return insertResult.rows[0].id;
}

/**
 * Ensure a movie exists and get its details
 * Combines ensureMovieExists with fetching from TMDB
 * 
 * @param client - PostgreSQL client (for transaction support)
 * @param tmdb_id - TMDB movie ID
 * @returns Tuple of [movieId, movieDetails]
 * 
 * @example
 * ```ts
 * const [movieId, details] = await ensureMovieExistsWithDetails(client, 550);
 * // Can use details for validation without extra TMDB call
 * ```
 */
export async function ensureMovieExistsWithDetails(
  client: pg.PoolClient,
  tmdb_id: number
): Promise<[number, ReturnType<typeof fetchMovieDetailsFromTMDB> extends Promise<infer T> ? T : never]> {
  // Check if movie already exists
  const movieCheck = await client.query<{ id: number }>(
    'SELECT id FROM movies WHERE tmdb_id = $1',
    [tmdb_id]
  );

  if (movieCheck.rows.length > 0) {
    // Movie exists, but we still need to fetch details for validation/display
    const movieDetails = await fetchMovieDetailsFromTMDB(tmdb_id);
    return [movieCheck.rows[0].id, movieDetails];
  }

  // Fetch movie details from TMDB
  const movieDetails = await fetchMovieDetailsFromTMDB(tmdb_id);

  // Insert movie into database
  const insertResult = await client.query<{ id: number }>(
    `INSERT INTO movies (tmdb_id, title, year, overview, poster_url, rating)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      movieDetails.tmdb_id,
      movieDetails.title,
      movieDetails.year,
      movieDetails.overview,
      movieDetails.poster_url,
      movieDetails.rating,
    ]
  );

  return [insertResult.rows[0].id, movieDetails];
}

/**
 * Check if a movie is already in user's watchlist
 * 
 * @param client - PostgreSQL client
 * @param userId - User ID
 * @param movieId - Database movie ID (not TMDB ID)
 * @returns true if in watchlist
 */
export async function isInWatchlist(
  client: pg.PoolClient,
  userId: number,
  movieId: number
): Promise<boolean> {
  const result = await client.query<{ id: number }>(
    'SELECT id FROM watchlist WHERE user_id = $1 AND movie_id = $2',
    [userId, movieId]
  );
  return result.rows.length > 0;
}

/**
 * Check if a movie is already watched by user
 * 
 * @param client - PostgreSQL client
 * @param userId - User ID
 * @param movieId - Database movie ID (not TMDB ID)
 * @returns true if watched
 */
export async function isWatched(
  client: pg.PoolClient,
  userId: number,
  movieId: number
): Promise<boolean> {
  const result = await client.query<{ id: number }>(
    'SELECT id FROM watched WHERE user_id = $1 AND movie_id = $2',
    [userId, movieId]
  );
  return result.rows.length > 0;
}

/**
 * Get database movie ID from TMDB ID
 * 
 * @param client - PostgreSQL client
 * @param tmdb_id - TMDB movie ID
 * @returns Database movie ID or null if not found
 */
export async function getMovieIdByTMDBId(
  client: pg.PoolClient,
  tmdb_id: number
): Promise<number | null> {
  const result = await client.query<{ id: number }>(
    'SELECT id FROM movies WHERE tmdb_id = $1',
    [tmdb_id]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Bulk check watchlist status for multiple movies
 * Optimized for enriching search results
 * 
 * @param client - PostgreSQL client
 * @param userId - User ID
 * @param movieIds - Array of database movie IDs
 * @returns Set of movie IDs that are in watchlist
 */
export async function bulkCheckWatchlist(
  client: pg.PoolClient,
  userId: number,
  movieIds: number[]
): Promise<Set<number>> {
  if (movieIds.length === 0) return new Set();
  
  const result = await client.query<{ movie_id: number }>(
    'SELECT movie_id FROM watchlist WHERE user_id = $1 AND movie_id = ANY($2)',
    [userId, movieIds]
  );
  
  return new Set(result.rows.map(r => r.movie_id));
}

/**
 * Bulk check watched status for multiple movies
 * Optimized for enriching search results
 * 
 * @param client - PostgreSQL client
 * @param userId - User ID
 * @param movieIds - Array of database movie IDs
 * @returns Map of movie ID to { rating, notes }
 */
export async function bulkCheckWatched(
  client: pg.PoolClient,
  userId: number,
  movieIds: number[]
): Promise<Map<number, { rating: number | null; notes: string | null }>> {
  if (movieIds.length === 0) return new Map();
  
  const result = await client.query<{ movie_id: number; rating: number | null; notes: string | null }>(
    'SELECT movie_id, rating, notes FROM watched WHERE user_id = $1 AND movie_id = ANY($2)',
    [userId, movieIds]
  );
  
  const watchedMap = new Map<number, { rating: number | null; notes: string | null }>();
  result.rows.forEach(row => {
    watchedMap.set(row.movie_id, { rating: row.rating, notes: row.notes });
  });
  
  return watchedMap;
}




