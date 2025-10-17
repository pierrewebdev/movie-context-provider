import { z } from 'zod';
import { MOVIE_POSTER_WIDGET_URL } from '../utils/config.js';
import { getMovieDetails as fetchMovieDetails, searchMovies as tmdbSearchMovies } from '../utils/tmdb.js';
import { query } from '../db/client.js';
import { withToolHandler } from '../utils/tool-helpers.js';

export const GetMovieDetailsSchema = z.object({
  tmdb_id: z.number().int().positive().optional(),
  title: z.string().min(1).optional(),
  year: z.number().int().positive().optional(),
  castLimit: z.number().int().min(1).max(50).optional(),
  imageLimit: z.number().int().min(1).max(50).optional(),
  // When true, return a trimmed payload without heavy arrays and without UI widget
  minimal: z.boolean().optional(),
  // Force-disable widget even if minimal is false
  noWidget: z.boolean().optional(),
}).refine(
  (data) => data.tmdb_id !== undefined || data.title !== undefined,
  { message: 'Either tmdb_id or title must be provided' }
);

export type GetMovieDetailsInput = z.infer<typeof GetMovieDetailsSchema>;

/**
 * Result type for get movie details handler
 */
interface MovieDetailsResult {
  textContent: string;
  structuredContent: any;
  widgetMeta?: any;
}

/**
 * Core handler for get movie details
 */
async function handleGetMovieDetails(validatedInput: GetMovieDetailsInput, userId?: number): Promise<MovieDetailsResult> {
  const useMinimal = Boolean(validatedInput.minimal);
  const disableWidget = Boolean(validatedInput.noWidget);
  
  console.log('[movieDetails] Widget config:', {
    disableWidget,
    useMinimal,
    MOVIE_POSTER_WIDGET_URL,
    willShowWidget: !disableWidget && !useMinimal && !!MOVIE_POSTER_WIDGET_URL,
  });

  // Resolve title to tmdb_id if needed
  let tmdbId: number;
  
  if (validatedInput.tmdb_id) {
    tmdbId = validatedInput.tmdb_id;
  } else if (validatedInput.title) {
    // Search for the movie by title
    console.log('[movieDetails] Searching for movie by title:', validatedInput.title);
    const searchResults = await tmdbSearchMovies(
      validatedInput.title,
      validatedInput.year
    );
    
    if (searchResults.length === 0) {
      throw new Error(`No movie found matching "${validatedInput.title}". Please check the title and try again. Try using search_movies to see available options.`);
    }
    
    // Use the first (most relevant) match
    // TMDB returns results by relevance, so the first one is usually what the user wants
    tmdbId = searchResults[0].tmdb_id;
    console.log(`[movieDetails] Found ${searchResults.length} match(es) for "${validatedInput.title}", using most relevant:`, searchResults[0].title, searchResults[0].year ?? '', 'tmdb_id:', tmdbId);
  } else {
    // This should never happen due to schema validation
    throw new Error('Either tmdb_id or title must be provided');
  }

  const movie = await fetchMovieDetails(tmdbId);

  // Check if user has this movie in watchlist or watched (if authenticated)
  let userStatus: { inWatchlist: boolean; isWatched: boolean; rating?: number; notes?: string } | undefined;
  if (userId) {
    try {
      // Get movie_id from our database (use resolved tmdbId, not validatedInput)
      const movieResult = await query<{ id: number }>(
        'SELECT id FROM movies WHERE tmdb_id = $1',
        [tmdbId]
      );
      
      if (movieResult.rows.length > 0) {
        const movieId = movieResult.rows[0].id;
        
        // Check watchlist
        const watchlistResult = await query(
          'SELECT 1 FROM watchlist WHERE user_id = $1 AND movie_id = $2',
          [userId, movieId]
        );
        
        // Check watched
        const watchedResult = await query<{ rating: number | null; notes: string | null }>(
          'SELECT rating, notes FROM watched WHERE user_id = $1 AND movie_id = $2',
          [userId, movieId]
        );
        
        userStatus = {
          inWatchlist: watchlistResult.rows.length > 0,
          isWatched: watchedResult.rows.length > 0,
          rating: watchedResult.rows[0]?.rating ?? undefined,
          notes: watchedResult.rows[0]?.notes ?? undefined,
        };
      }
    } catch (statusError) {
      console.error('Error checking user status for movie:', statusError);
      // Don't fail the whole request if status check fails
    }
  }

  // When widget is available, use minimal text. Otherwise, full details.
  const hasWidget = !disableWidget && !useMinimal && MOVIE_POSTER_WIDGET_URL;
  
  const summaryLines = hasWidget
    ? [
        // Minimal text when widget is shown - widgetDescription prevents duplication
        `${movie.title} (${movie.year ?? 'Unknown'})`,
      ]
    : [
        // Full details when no widget
        `Title: ${movie.title}`,
        `Year: ${movie.year ?? 'Unknown'}`,
        `Rating: ${movie.rating}/10`,
        movie.tagline ? `Tagline: ${movie.tagline}` : null,
        movie.overview ? `Overview: ${movie.overview}` : null,
        movie.poster_url ? `Poster: ${movie.poster_url}` : null,
        movie.backdrop_url ? `Backdrop: ${movie.backdrop_url}` : null,
        ...(movie.warnings ?? []).map((warning) => `⚠️ ${warning}`),
      ].filter(Boolean);

  const textContent = summaryLines.join('\n');

  // OpenAI Apps SDK metadata format (use _meta with slash-separated properties)
  const widgetMeta = !disableWidget && !useMinimal && MOVIE_POSTER_WIDGET_URL
    ? {
        'openai/outputTemplate': 'ui://widget/movie-poster',
        'openai/widgetAccessible': true,
        'openai/resultCanProduceWidget': true,
        'openai/toolInvocation/invoking': 'Loading movie details...',
        'openai/toolInvocation/invoked': 'Loaded movie details',
      }
    : undefined;

  // Provide structured data for the widget
  // NOTE: Model can see this and may display it below widget - this is a known
  // limitation of OpenAI's current MCP implementation. widgetDescription and
  // custom fields don't prevent this behavior.
  const structuredContent = {
    success: true,
    movie: {
      tmdb_id: movie.tmdb_id,
      title: movie.title,
      year: movie.year ?? null,
      overview: movie.overview,
      poster_url: movie.poster_url ?? null,
      backdrop_url: movie.backdrop_url ?? null,
      rating: movie.rating ?? null,
      tagline: movie.tagline ?? null,
      runtime: movie.runtime ?? null,
      director: movie.director ?? null,
      budget: movie.budget ?? null,
      revenue: movie.revenue ?? null,
      genres: movie.genres ?? [],
      cast: movie.cast.slice(0, 3),
      // Include user status if authenticated
      ...(userStatus && {
        inWatchlist: userStatus.inWatchlist,
        isWatched: userStatus.isWatched,
        userRating: userStatus.rating,
        userNotes: userStatus.notes,
      }),
    },
  };

  // Widget metadata
  const responseMeta = widgetMeta
    ? {
        ...widgetMeta,
        'openai/widgetDescription': 
          `Interactive movie card showing poster, title, rating, tagline, overview, and cast for ${movie.title}. ` +
          `User can add to watchlist or mark as watched directly from the widget.`,
      }
    : undefined;

  return {
    textContent,
    structuredContent,
    widgetMeta: responseMeta,
  };
}

/**
 * Get movie details with widget support
 * Uses tool helper for standardized error handling and response formatting
 */
export const getMovieDetails = withToolHandler({
  schema: GetMovieDetailsSchema,
  toolName: 'get_movie_details',
  handler: handleGetMovieDetails,
  toTextContent: (result) => result.textContent,
  toStructuredContent: (result) => result.structuredContent,
  toMeta: (result) => result.widgetMeta,
  errorMessagePrefix: 'Unable to load movie details',
});

export const getMovieDetailsToolDefinition = {
  name: 'get_movie_details',
  description: 'Get detailed information about a specific movie including poster, cast, ratings, and overview. You can provide EITHER tmdb_id (if you already have it from search) OR title (to search and fetch details in one call). When user asks "show details for [movie name]", use the title parameter directly - no need to search first. This is the preferred tool for viewing a single movie.',
  inputSchema: {
    type: 'object',
    properties: {
      tmdb_id: {
        type: 'number',
        description: 'TMDB movie identifier (use this if you already have it from a previous search)',
      },
      title: {
        type: 'string',
        description: 'Movie title to search for and fetch details (use this when user asks for details about a specific movie). If multiple matches are found, will return an error suggesting to use search_movies instead.',
      },
      year: {
        type: 'number',
        description: 'Optional release year to disambiguate when using title parameter (e.g., "Dune" could be 1984 or 2021)',
      },
      castLimit: {
        type: 'number',
        description: 'Maximum number of cast members to return (default 10)',
        minimum: 1,
        maximum: 50,
      },
      imageLimit: {
        type: 'number',
        description: 'Maximum number of poster/backdrop images to return (default 5)',
        minimum: 1,
        maximum: 50,
      },
      minimal: {
        type: 'boolean',
        description: 'If true, return a trimmed payload without widget and heavy arrays.',
      },
      noWidget: {
        type: 'boolean',
        description: 'Force-disable widget block even when minimal is false.',
      },
    },
    required: [],
  },
  // Add widget metadata to tool definition (required for OpenAI Apps SDK)
  ...(MOVIE_POSTER_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': 'ui://widget/movie-poster',
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Loading movie details...',
      'openai/toolInvocation/invoked': 'Loaded movie details',
    },
  }),
};
