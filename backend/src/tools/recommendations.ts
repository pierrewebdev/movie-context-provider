/**
 * AI-Powered Recommendations Tool
 * Generate personalized movie recommendations using Claude
 */

import { z } from 'zod';
import { query } from '../db/client.js';
import { getRecommendations as getAIRecommendations } from '../utils/llm.js';
import { searchMovies as tmdbSearchMovies } from '../utils/tmdb.js';
import type { WatchedMovie, UserPreferences } from '../utils/llm.js';
import { WIDGET_CONFIG, OPENAI_WIDGET_META } from '../config/constants.js';
import { withToolHandler } from '../utils/tool-helpers.js';

const MOVIE_LIST_WIDGET_URL = process.env.MOVIE_POSTER_WIDGET_URL;

// Input schema
export const GetRecommendationsSchema = z.object({
  mood: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

export type GetRecommendationsInput = z.infer<typeof GetRecommendationsSchema>;

/**
 * Get AI-powered movie recommendations - Handler logic
 */
async function handleGetRecommendations(validatedInput: GetRecommendationsInput, userId?: number) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Fetch user's watch history (focus on highly-rated movies for preference learning)
  const watchHistoryResult = await query<{
    title: string;
    year: number;
    rating: number;
    overview: string;
  }>(
    `SELECT 
      m.title,
      m.year,
      w.rating,
      m.overview
     FROM watched w
     JOIN movies m ON w.movie_id = m.id
     WHERE w.user_id = $1
     ORDER BY w.rating DESC, w.watched_at DESC
     LIMIT 20`,
    [userId]
  );

  const watchHistory: WatchedMovie[] = watchHistoryResult.rows.map((row: {
    title: string;
    year: number;
    rating: number;
    overview: string;
  }) => ({
    title: row.title,
    year: row.year,
    rating: row.rating,
    overview: row.overview,
  }));

  // Fetch ALL watched movie titles AND IDs to exclude from recommendations
  const allWatchedResult = await query<{
    tmdb_id: number;
    title: string;
    year: number | null;
  }>(
    `SELECT m.tmdb_id, m.title, m.year
     FROM watched w
     JOIN movies m ON w.movie_id = m.id
     WHERE w.user_id = $1`,
    [userId]
  );

  const watchedTmdbIds = new Set(allWatchedResult.rows.map(row => row.tmdb_id));
  const allWatchedTitles: string[] = allWatchedResult.rows.map((row: {
    tmdb_id: number;
    title: string;
    year: number | null;
  }) => {
    const yearStr = row.year ? ` (${row.year})` : '';
    return `${row.title}${yearStr}`;
  });

  // Fetch user preferences
  const preferencesResult = await query<{ key: string; value: any }>(
    'SELECT key, value FROM preferences WHERE user_id = $1',
    [userId]
  );

  const preferences: UserPreferences = {};
  for (const row of preferencesResult.rows) {
    preferences[row.key] = row.value;
  }

  // Check if user has enough data for recommendations
  if (watchHistory.length === 0 && Object.keys(preferences).length === 0) {
    return {
      message: 'Not enough data for recommendations yet. Try watching and rating a few movies or set your genre preferences.',
      movies: [],
      count: 0,
      widgetMeta: undefined,
    };
  }

  // Generate recommendations using Claude (passing watched titles to exclude)
  const aiRecommendations = await getAIRecommendations(
    watchHistory,
    preferences,
    validatedInput.mood,
    validatedInput.limit * 2, // Request more to account for filtering
    allWatchedTitles
  );

  // Search TMDB for each recommendation to get full movie details
  const moviePromises = aiRecommendations.map(async (rec) => {
    try {
      // Extract title and year from Claude's response
      const titleMatch = rec.title.match(/^(.+?)\s*\((\d{4})\)$/);
      const title = titleMatch ? titleMatch[1].trim() : rec.title.trim();
      const year = titleMatch ? parseInt(titleMatch[2], 10) : undefined;
      
      // Search TMDB
      const searchResults = await tmdbSearchMovies(title, year);
      if (searchResults.length === 0) {
        console.log(`⚠️  No TMDB results for recommendation: ${rec.title}`);
        return null;
      }
      
      // Take the first (most relevant) result
      const movie = searchResults[0];
      
      // Filter out if already watched (double-check by TMDB ID)
      if (watchedTmdbIds.has(movie.tmdb_id)) {
        console.log(`✓ Filtered out watched movie: ${movie.title}`);
        return null;
      }
      
      return {
        ...movie,
        reason: rec.reason, // Preserve Claude's reasoning
      };
    } catch (error) {
      console.error(`Failed to fetch TMDB data for: ${rec.title}`, error);
      return null;
    }
  });

  const movieResults = await Promise.all(moviePromises);
  const movies = movieResults
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .slice(0, validatedInput.limit); // Limit to requested count

  const summaryMessage = validatedInput.mood
    ? `Found ${movies.length} recommendation(s) for mood: ${validatedInput.mood}.`
    : `Found ${movies.length} personalized recommendation(s).`;

  // Widget metadata
  const widgetMeta = MOVIE_LIST_WIDGET_URL && movies.length > 0
    ? {
        'openai/outputTemplate': WIDGET_CONFIG.list.uri,
        ...OPENAI_WIDGET_META,
        'openai/toolInvocation/invoking': 'Generating recommendations...',
        'openai/toolInvocation/invoked': 'Generated recommendations',
      }
    : undefined;

  return {
    message: summaryMessage,
    movies,
    count: movies.length,
    widgetMeta,
  };
}

/**
 * Get AI-powered movie recommendations
 * Uses Claude to analyze user's watch history and preferences
 * 
 * @param input - Optional mood and limit parameters
 * @param userId - Authenticated user's ID
 * @returns Array of personalized recommendations with reasoning
 */
export const getRecommendations = withToolHandler({
  schema: GetRecommendationsSchema as any, // Zod default creates input/output type mismatch
  toolName: 'get_recommendations',
  handler: handleGetRecommendations,
  toTextContent: (result) => result.message,
  toStructuredContent: (result) => ({
    success: true,
    movies: result.movies,
    count: result.count,
    message: result.message,
  }),
  toMeta: (result) => result.widgetMeta,
  errorMessagePrefix: 'Failed to generate recommendations',
});

// Tool metadata for MCP registration
export const getRecommendationsToolDefinition = {
  name: 'get_recommendations',
  description: 'Get AI-powered personalized movie recommendations based on your watch history and preferences. Uses Claude AI to analyze your taste and suggest movies you haven\'t watched yet. Optionally specify a mood to tailor recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      mood: {
        type: 'string',
        description: 'Optional mood or vibe (e.g., "uplifting", "thought-provoking", "thrilling", "relaxing")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of recommendations (1-10, default: 5)',
        minimum: 1,
        maximum: 10,
      },
    },
  },
  // Add widget metadata to tool definition
  ...(MOVIE_LIST_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': WIDGET_CONFIG.list.uri,
      ...OPENAI_WIDGET_META,
      'openai/toolInvocation/invoking': 'Generating recommendations...',
      'openai/toolInvocation/invoked': 'Generated recommendations',
    },
  }),
};

