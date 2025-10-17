import { PoolClient } from 'pg';
/**
 * Watched Movies Tools
 * Mark movies as watched with ratings and retrieve watch history
 */

import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { MOVIE_LIST_WIDGET_URL } from '../utils/config.js';
import { getMovieDetails } from '../utils/tmdb.js';
import { withSimpleToolHandler, withToolHandler } from '../utils/tool-helpers.js';

// Input schemas
export const MarkAsWatchedSchema = z.object({
  tmdb_id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  notes: z.string().optional(),
});

export const GetWatchedMoviesSchema = z.object({
  min_rating: z.number().int().min(1).max(5).optional(),
});

export type MarkAsWatchedInput = z.infer<typeof MarkAsWatchedSchema>;
export type GetWatchedMoviesInput = z.infer<typeof GetWatchedMoviesSchema>;

export const MarkAsWatchedBatchSchema = z.object({
  entries: z.array(MarkAsWatchedSchema).min(1, 'Provide at least one movie to mark as watched'),
  transaction: z.boolean().default(true),
});

export type MarkAsWatchedBatchInput = z.infer<typeof MarkAsWatchedBatchSchema>;

/**
 * Mark a movie as watched with a rating
 * Removes movie from watchlist if present
 * 
 * @param input - Movie TMDB ID, rating (1-5), and optional notes
 * @param userId - Authenticated user's ID
 * @returns Success status and message
 */
export const markAsWatched = withSimpleToolHandler(
  MarkAsWatchedSchema,
  'mark_as_watched',
  async (validatedInput: MarkAsWatchedInput, userId?: number) => {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = await transaction(async (client) => handleMarkAsWatched(client, validatedInput, userId));
    
    return {
      success: result.success,
      message: result.message,
    };
  },
  'Failed to mark movie as watched'
);

export async function markAsWatchedBatch(input: MarkAsWatchedBatchInput, userId: number) {
  const validatedInput = MarkAsWatchedBatchSchema.parse(input);

  if (!validatedInput.transaction) {
    const results: Array<{ tmdb_id: number; success: boolean; message: string }> = [];

    for (const entry of validatedInput.entries) {
      try {
        const result = await transaction(async (client) => handleMarkAsWatched(client, entry, userId));
        results.push({ tmdb_id: entry.tmdb_id, success: result.success, message: result.message });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ tmdb_id: entry.tmdb_id, success: false, message });
      }
    }

    const summary = results
      .map((result) => `• ${result.tmdb_id}: ${result.success ? '✅' : '❌'} ${result.message}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: `Batch mark as watched (best effort):\n${summary}`,
        },
      ],
      structuredContent: {
        success: results.every((result) => result.success),
        results,
      },
    };
  }

  // Transactional path (all-or-nothing)
  const results = await transaction(async (client) => {
    const batchResults: Array<{ tmdb_id: number; success: boolean; message: string }> = [];

    for (const entry of validatedInput.entries) {
      const result = await handleMarkAsWatched(client, entry, userId);
      batchResults.push({ tmdb_id: entry.tmdb_id, success: result.success, message: result.message });
    }

    return batchResults;
  });

  const summary = results
    .map((result) => `• ${result.tmdb_id}: ${result.success ? '✅' : '❌'} ${result.message}`)
    .join('\n');

  return {
    content: [
      {
        type: 'text' as const,
        text: `Batch mark as watched (transactional):\n${summary}`,
      },
    ],
    structuredContent: {
      success: true,
      results,
    },
  };
}

/**
 * Get the user's watch history - Handler logic
 */
async function handleGetWatchedMovies(validatedInput: GetWatchedMoviesInput, userId?: number) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Build query with optional rating filter
  const queryText = `
    SELECT 
      m.tmdb_id,
      m.title,
      m.year,
      m.overview,
      m.poster_url,
      m.rating as tmdb_rating,
      w.rating as user_rating,
      w.notes,
      w.watched_at
    FROM watched w
    JOIN movies m ON w.movie_id = m.id
    WHERE w.user_id = $1
    ${validatedInput.min_rating ? 'AND w.rating >= $2' : ''}
    ORDER BY w.watched_at DESC
  `;

  const params = validatedInput.min_rating 
    ? [userId, validatedInput.min_rating]
    : [userId];

  const result = await query(queryText, params);

  const watchedMovies = result.rows.map((row: {
    tmdb_id: number;
    title: string;
    year: number | null;
    overview: string;
    poster_url: string | null;
    tmdb_rating: string | number | null;
    user_rating: number;
    notes: string | null;
    watched_at: Date;
  }) => ({
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    overview: row.overview,
    poster_url: row.poster_url,
    rating: row.tmdb_rating ? Number(row.tmdb_rating) : null,
    userRating: row.user_rating,
    notes: row.notes,
    watched_at: row.watched_at,
  }));

  const summaryMessage = validatedInput.min_rating
    ? `Found ${watchedMovies.length} movie(s) with rating >= ${validatedInput.min_rating}.`
    : `Found ${watchedMovies.length} watched movie(s).`;

  // Widget metadata
  const widgetMeta = MOVIE_LIST_WIDGET_URL && watchedMovies.length > 0
    ? {
        'openai/outputTemplate': 'ui://widget/movie-list',
        'openai/widgetAccessible': true,
        'openai/resultCanProduceWidget': true,
        'openai/toolInvocation/invoking': 'Loading watched movies...',
        'openai/toolInvocation/invoked': 'Loaded watched movies',
      }
    : undefined;

  // Prepare movies for widget - add isWatched flag
  const moviesForWidget = watchedMovies.map(m => ({
    ...m,
    isWatched: true,
    userNotes: m.notes,
  }));

  return {
    message: summaryMessage,
    movies: moviesForWidget,
    watched: watchedMovies,
    count: watchedMovies.length,
    widgetMeta,
  };
}

/**
 * Get the user's watch history
 * Optionally filter by minimum rating
 * 
 * @param input - Optional minimum rating filter
 * @param userId - Authenticated user's ID
 * @returns Array of watched movies
 */
export const getWatchedMovies = withToolHandler({
  schema: GetWatchedMoviesSchema,
  toolName: 'get_watched_movies',
  handler: handleGetWatchedMovies,
  toTextContent: (result) => result.message,
  toStructuredContent: (result) => ({
    success: true,
    movies: result.movies,
    watched: result.watched,
    count: result.count,
    message: result.message,
  }),
  toMeta: (result) => result.widgetMeta,
  errorMessagePrefix: 'Failed to fetch watched movies',
});

// Tool metadata for MCP registration
export const markAsWatchedToolDefinition = {
  name: 'mark_as_watched',
  description: 'Mark a movie as watched with a rating (1-5 stars). Automatically removes the movie from your watchlist if present.',
  inputSchema: {
    type: 'object',
    properties: {
      tmdb_id: {
        type: 'number',
        description: 'TMDB movie ID',
      },
      rating: {
        type: 'number',
        description: 'Your rating (1-5 stars, where 5 is best)',
        minimum: 1,
        maximum: 5,
      },
      notes: {
        type: 'string',
        description: 'Optional notes or review',
      },
    },
    required: ['tmdb_id', 'rating'],
  },
};

export const getWatchedMoviesToolDefinition = {
  name: 'get_watched_movies',
  description: 'Retrieve your watch history. Optionally filter by minimum rating to find your favorite movies.',
  inputSchema: {
    type: 'object',
    properties: {
      min_rating: {
        type: 'number',
        description: 'Optional minimum rating filter (1-5)',
        minimum: 1,
        maximum: 5,
      },
    },
  },
  // Add widget metadata to tool definition
  ...(MOVIE_LIST_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': 'ui://widget/movie-list',
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Loading watched movies...',
      'openai/toolInvocation/invoked': 'Loaded watched movies',
    },
  }),
};

export const markAsWatchedBatchToolDefinition = {
  name: 'mark_as_watched_batch',
  description: 'Mark multiple movies as watched in one request. Supports transactional (default) or best-effort modes.',
  inputSchema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tmdb_id: { type: 'number', description: 'TMDB movie ID' },
            rating: { type: 'number', description: 'Rating (1-5)', minimum: 1, maximum: 5 },
            notes: { type: 'string', description: 'Optional notes' },
          },
          required: ['tmdb_id', 'rating'],
        },
        minItems: 1,
        description: 'List of movies to mark as watched',
      },
      transaction: {
        type: 'boolean',
        description: 'If true (default), all entries are processed in a single transaction (all-or-nothing). If false, process each individually.',
      },
    },
    required: ['entries'],
  },
};

async function handleMarkAsWatched(
  client: PoolClient,
  input: MarkAsWatchedInput,
  userId: number
): Promise<{ success: boolean; message: string }> {
  // Get movie details to check release date
  const movieDetails = await getMovieDetails(input.tmdb_id);
  
  // Check if movie has been released
  if (movieDetails.release_date) {
    const releaseDate = new Date(movieDetails.release_date);
    const now = new Date();
    
    if (releaseDate > now) {
      const releaseDateStr = releaseDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      throw new Error(`"${movieDetails.title}" hasn't been released yet (releases on ${releaseDateStr}). You can add it to your watchlist instead.`);
    }
  }
  
  // Check if movie already exists in movies table
  const movieCheck = await client.query<{ id: number }>(
    'SELECT id FROM movies WHERE tmdb_id = $1',
    [input.tmdb_id]
  );

  let movieId: number;

  if (movieCheck.rows.length > 0) {
    movieId = movieCheck.rows[0].id;
  } else {
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

    movieId = insertResult.rows[0].id;
  }

  const watchedCheck = await client.query<{ id: number }>(
    'SELECT id FROM watched WHERE user_id = $1 AND movie_id = $2',
    [userId, movieId]
  );

  if (watchedCheck.rows.length > 0) {
    await client.query(
      `UPDATE watched 
       SET rating = $1, notes = $2, watched_at = NOW()
       WHERE user_id = $3 AND movie_id = $4`,
      [input.rating, input.notes || null, userId, movieId]
    );

    return {
      success: true,
      message: 'Updated watch record with new rating.',
    };
  }

  await client.query(
    `INSERT INTO watched (user_id, movie_id, rating, notes)
     VALUES ($1, $2, $3, $4)`,
    [userId, movieId, input.rating, input.notes || null]
  );

  const deleteResult = await client.query(
    'DELETE FROM watchlist WHERE user_id = $1 AND movie_id = $2',
    [userId, movieId]
  );

  const removedFromWatchlist = (deleteResult.rowCount ?? 0) > 0;

  return {
    success: true,
    message: removedFromWatchlist
      ? 'Movie marked as watched and removed from watchlist.'
      : 'Movie marked as watched.',
  };
}

