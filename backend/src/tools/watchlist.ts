/**
 * Watchlist Tools
 * Add movies to watchlist and retrieve user's watchlist
 */

import { z } from 'zod';
import pg from 'pg';
import { query, transaction } from '../db/client.js';
import { MOVIE_LIST_WIDGET_URL } from '../utils/config.js';
import { withSimpleToolHandler } from '../utils/tool-helpers.js';
import {
  ensureMovieExists,
  isInWatchlist,
  mapWatchlistRow,
  type WatchlistRecord,
} from '../db/utilities.js';

// Input schemas
export const AddToWatchlistSchema = z.object({
  tmdb_id: z.number().int().positive(),
  notes: z.string().optional(),
});

export type AddToWatchlistInput = z.infer<typeof AddToWatchlistSchema>;

/**
 * Add a movie to the user's watchlist
 * First ensures the movie exists in the movies table, then adds to watchlist
 * 
 * @param input - Movie TMDB ID and optional notes
 * @param userId - Authenticated user's ID
 * @returns Success status and message
 */
export const addToWatchlist = withSimpleToolHandler(
  AddToWatchlistSchema,
  'add_to_watchlist',
  async (validatedInput: AddToWatchlistInput, userId?: number) => {
    return await transaction(async (client) => {
      return await handleAddToWatchlist(client, validatedInput, userId!);
    });
  },
  'Failed to add to watchlist'
);

// Remove from watchlist schema
export const RemoveFromWatchlistSchema = z.object({
  tmdb_id: z.number().int().positive(),
});

export type RemoveFromWatchlistInput = z.infer<typeof RemoveFromWatchlistSchema>;

/**
 * Remove a movie from the user's watchlist
 * 
 * @param input - Movie TMDB ID
 * @param userId - Authenticated user's ID
 * @returns Success status and message
 */
export const removeFromWatchlist = withSimpleToolHandler(
  RemoveFromWatchlistSchema,
  'remove_from_watchlist',
  async (validatedInput: RemoveFromWatchlistInput, userId?: number) => {
    // Get movie_id from our database
    const movieResult = await query<{ id: number; title: string }>(
      'SELECT id, title FROM movies WHERE tmdb_id = $1',
      [validatedInput.tmdb_id]
    );

    if (movieResult.rows.length === 0) {
      throw new Error('Movie not found in database');
    }

    const movieId = movieResult.rows[0].id;
    const movieTitle = movieResult.rows[0].title;

    // Delete from watchlist
    const deleteResult = await query(
      'DELETE FROM watchlist WHERE user_id = $1 AND movie_id = $2 RETURNING id',
      [userId!, movieId]
    );

    if (deleteResult.rows.length === 0) {
      return {
        success: false,
        message: `"${movieTitle}" was not in your watchlist.`,
      };
    }

    return {
      success: true,
      message: `Removed "${movieTitle}" from your watchlist.`,
    };
  },
  'Failed to remove from watchlist'
);

/**
 * Get the user's watchlist
 * Returns all movies in the user's watchlist with metadata
 * 
 * @param userId - Authenticated user's ID
 * @returns Array of watchlist movies
 */
export async function getWatchlist(userId: number) {
  try {
    const result = await query(
      `SELECT 
        m.tmdb_id,
        m.title,
        m.year,
        m.overview,
        m.poster_url,
        m.rating,
        w.notes,
        w.added_at
       FROM watchlist w
       JOIN movies m ON w.movie_id = m.id
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [userId]
    );

    // Map database rows to typed WatchlistRecord objects
    const watchlistItems: WatchlistRecord[] = result.rows.map(mapWatchlistRow);

    const summaryLines = watchlistItems.length === 0
      ? ['Your watchlist is currently empty.']
      : watchlistItems.map((movie: {
          title: string;
          year: number | null;
          notes: string | null;
        }) => {
          const yearLabel = movie.year ? ` (${movie.year})` : '';
          const notesLabel = movie.notes ? ` – Notes: ${movie.notes}` : '';
          return `• ${movie.title}${yearLabel}${notesLabel}`;
        });

    const summaryMessage = `Found ${watchlistItems.length} movie(s) in your watchlist.`;

    // Widget metadata
    const widgetMeta = MOVIE_LIST_WIDGET_URL && watchlistItems.length > 0
      ? {
          'openai/outputTemplate': 'ui://widget/movie-list',
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/toolInvocation/invoking': 'Loading watchlist...',
          'openai/toolInvocation/invoked': 'Loaded watchlist',
        }
      : undefined;

    // Prepare movies for widget - add inWatchlist flag
    const moviesForWidget = watchlistItems.map(m => ({
      ...m,
      inWatchlist: true,
      isWatched: false, // Watchlist items aren't watched yet
    }));

    return {
      content: [
        {
          type: 'text' as const,
          text: widgetMeta ? summaryMessage : `${summaryMessage}\n${summaryLines.join('\n')}`,
        },
      ],
      structuredContent: {
        success: true,
        movies: moviesForWidget, // Widget expects 'movies' key
        watchlist: watchlistItems, // Keep for backward compatibility
        count: watchlistItems.length,
        message: summaryMessage,
      },
      ...(widgetMeta && { _meta: widgetMeta }),
    };
  } catch (error) {
    console.error('Error in getWatchlist tool:', error);

    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error
            ? `Failed to load watchlist: ${error.message}`
            : 'Failed to load watchlist due to an unknown error.',
        },
      ],
      structuredContent: {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      isError: true,
    };
  }
}

// Tool metadata for MCP registration
export const addToWatchlistToolDefinition = {
  name: 'add_to_watchlist',
  description: 'Add a movie to your personal watchlist. The movie will be automatically fetched from TMDB if not already in the database.',
  inputSchema: {
    type: 'object',
    properties: {
      tmdb_id: {
        type: 'number',
        description: 'TMDB movie ID (from search results)',
      },
      notes: {
        type: 'string',
        description: 'Optional personal notes about why you want to watch this movie',
      },
    },
    required: ['tmdb_id'],
  },
};

export const removeFromWatchlistToolDefinition = {
  name: 'remove_from_watchlist',
  description: 'Remove a movie from your personal watchlist.',
  inputSchema: {
    type: 'object',
    properties: {
      tmdb_id: {
        type: 'number',
        description: 'TMDB movie ID of the movie to remove',
      },
    },
    required: ['tmdb_id'],
  },
};

async function handleAddToWatchlist(
  client: pg.PoolClient,
  input: AddToWatchlistInput,
  userId: number
): Promise<{ success: boolean; message: string }> {
  // Ensure movie exists in database (fetches from TMDB if needed)
  const movieId = await ensureMovieExists(client, input.tmdb_id);

  // Check if already in watchlist
  if (await isInWatchlist(client, userId, movieId)) {
    return {
      success: false,
      message: 'Movie is already in your watchlist',
    };
  }

  // Add to watchlist
  await client.query(
    `INSERT INTO watchlist (user_id, movie_id, notes)
     VALUES ($1, $2, $3)`,
    [userId, movieId, input.notes || null]
  );

  return {
    success: true,
    message: 'Movie added to watchlist successfully',
  };
}

export const getWatchlistToolDefinition = {
  name: 'get_watchlist',
  description: 'Retrieve all movies in your watchlist with details and personal notes.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  // Add widget metadata to tool definition
  ...(MOVIE_LIST_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': 'ui://widget/movie-list',
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Loading watchlist...',
      'openai/toolInvocation/invoked': 'Loaded watchlist',
    },
  }),
};

