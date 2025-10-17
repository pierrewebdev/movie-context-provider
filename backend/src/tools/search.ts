/**
 * Search Movies Tool
 * Searches for movies using the TMDB API
 */

import { z } from 'zod';
import { 
  searchMovies as tmdbSearchMovies, 
  searchPeople, 
  discoverMovies 
} from '../utils/tmdb.js';
import { MOVIE_LIST_WIDGET_URL } from '../utils/config.js';
import { query } from '../db/client.js';
import { withToolHandler } from '../utils/tool-helpers.js';
import { GENRE_MAP } from '../config/constants.js';

/**
 * Convert genre name to TMDB genre ID
 * If input is already a number/ID, return as-is
 */
function normalizeGenre(genre: string | undefined): string | undefined {
  if (!genre) return undefined;
  
  // If it's already a number, return as-is
  if (/^\d+$/.test(genre)) return genre;
  
  // Convert to lowercase and look up
  const normalized = genre.toLowerCase().trim();
  return GENRE_MAP[normalized] || genre; // Return original if no match
}

// Input schema validation with Zod
const SearchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  // Preprocess year: treat 0 or invalid years as undefined
  year: z.preprocess(
    (val) => (typeof val === 'number' && val > 0) ? val : undefined,
    z.number().int().min(1900, 'Year must be 1900 or later').max(2100, 'Year must be 2100 or earlier').optional()
  ),
  genre: z.string().optional(),
});

export const SearchMoviesSchema = z.object({
  searches: z.array(SearchQuerySchema).min(1, 'Provide at least one search query'),
});

export type SearchMoviesInput = {
  searches: {
    query: string;
    year?: number;
    genre?: string;
  }[];
};

/**
 * Helper function to enrich movies with user status (watchlist/watched)
 */
async function enrichMoviesWithUserStatus(movies: any[], userId: number): Promise<any[]> {
  if (movies.length === 0) return movies;

  try {
    const tmdbIds = movies.map(m => m.tmdb_id);
    
    // Get movie IDs from database for these TMDB IDs
    const movieIdsResult = await query<{ tmdb_id: number; id: number }>(
      'SELECT tmdb_id, id FROM movies WHERE tmdb_id = ANY($1)',
      [tmdbIds]
    );
    
    const tmdbIdToMovieId = new Map<number, number>();
    movieIdsResult.rows.forEach(row => {
      tmdbIdToMovieId.set(row.tmdb_id, row.id);
    });
    
    if (tmdbIdToMovieId.size === 0) {
      // None of these movies are in our database yet
      return movies.map(m => ({ ...m, inWatchlist: false, isWatched: false }));
    }
    
    const movieIds = Array.from(tmdbIdToMovieId.values());
    
    // Bulk check watchlist
    const watchlistResult = await query<{ movie_id: number }>(
      'SELECT movie_id FROM watchlist WHERE user_id = $1 AND movie_id = ANY($2)',
      [userId, movieIds]
    );
    const watchlistedIds = new Set(watchlistResult.rows.map(r => r.movie_id));
    
    // Bulk check watched
    const watchedResult = await query<{ movie_id: number; rating: number | null; notes: string | null }>(
      'SELECT movie_id, rating, notes FROM watched WHERE user_id = $1 AND movie_id = ANY($2)',
      [userId, movieIds]
    );
    const watchedMap = new Map<number, { rating: number | null; notes: string | null }>();
    watchedResult.rows.forEach(row => {
      watchedMap.set(row.movie_id, { rating: row.rating, notes: row.notes });
    });
    
    // Enrich movies with status
    return movies.map(movie => {
      const movieId = tmdbIdToMovieId.get(movie.tmdb_id);
      if (!movieId) {
        return { ...movie, inWatchlist: false, isWatched: false };
      }
      
      const watchedInfo = watchedMap.get(movieId);
      
      return {
        ...movie,
        inWatchlist: watchlistedIds.has(movieId),
        isWatched: watchedMap.has(movieId),
        userRating: watchedInfo?.rating ?? undefined,
        userNotes: watchedInfo?.notes ?? undefined,
      };
    });
  } catch (error) {
    console.error('Error enriching movies with user status:', error);
    // Return movies without status if enrichment fails
    return movies;
  }
}

/**
 * Result type for search movies handler
 */
interface SearchMoviesResult {
  summaryMessage: string;
  summary: string;
  useWidget: boolean;
  widgetMeta?: any;
  allMovies: any[];
  results: any[];
  totalResults: number;
}

/**
 * Core handler for search movies
 */
async function handleSearchMovies(validatedInput: SearchMoviesInput, userId?: number): Promise<SearchMoviesResult> {
  const results = await Promise.all(
    validatedInput.searches.map(async (search) => {
      let matches = await tmdbSearchMovies(search.query, search.year, search.genre);
      
      // Enrich with user status if authenticated
      if (userId && matches.length > 0) {
        matches = await enrichMoviesWithUserStatus(matches, userId);
      }
      
      return {
        query: search.query,
        year: search.year ?? null,
        genre: search.genre ?? null,
        results: matches,
      };
    })
  );

  // Flatten all movies from all searches into a single list for the widget
  const allMovies = results.flatMap(entry => entry.results);
  const totalResults = allMovies.length;

  const summary = results
    .map((entry) => {
      if (entry.results.length === 0) {
        return `• ${entry.query}: no matches found.`;
      }
      return `• ${entry.query}: found ${entry.results.length} result(s)`;
    })
    .join('\n');

  const summaryMessage = `Found ${totalResults} movie(s) across ${results.length} search(es).`;

  // Widget metadata - show widget if we have results
  const useWidget = Boolean(MOVIE_LIST_WIDGET_URL && totalResults > 0);
  
  const widgetMeta = useWidget
    ? {
        'openai/outputTemplate': 'ui://widget/movie-list',
        'openai/widgetAccessible': true,
        'openai/resultCanProduceWidget': true,
        'openai/toolInvocation/invoking': 'Searching for movies...',
        'openai/toolInvocation/invoked': 'Search complete',
      }
    : undefined;

  return {
    summaryMessage,
    summary,
    useWidget,
    widgetMeta,
    allMovies,
    results,
    totalResults,
  };
}

/**
 * Search for one or multiple movies by title
 * Can handle single or batch searches
 * 
 * @param input - Array of search queries
 * @returns Grouped search results
 */
export const searchMovies = withToolHandler({
  schema: SearchMoviesSchema as z.ZodType<SearchMoviesInput>,
  toolName: 'search_movies',
  handler: handleSearchMovies,
  toTextContent: (result) => result.useWidget ? result.summaryMessage : `${result.summaryMessage}\n${result.summary}`,
  toStructuredContent: (result) => ({
    success: true,
    movies: result.allMovies, // Widget expects 'movies' key
    results: result.results, // Keep grouped results for backward compatibility
    count: result.totalResults,
    message: result.summaryMessage,
  }),
  toMeta: (result) => result.widgetMeta,
  errorMessagePrefix: 'Failed to search movies',
});

export const searchMoviesToolDefinition = {
  name: 'search_movies',
  description: 'Search for multiple movies in one request. Useful when user wants to look up several specific movies at once (e.g., "Find Inception, The Matrix, and Blade Runner").',
  inputSchema: {
    type: 'object',
    properties: {
      searches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string' },
            year: { type: 'number', description: 'Optional release year filter' },
            genre: { type: 'string', description: 'Optional genre filter' },
          },
          required: ['query'],
        },
        description: 'List of search queries to run',
        minItems: 1,
      },
    },
    required: ['searches'],
  },
  // Add widget metadata to tool definition
  ...(MOVIE_LIST_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': 'ui://widget/movie-list',
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Searching for movies...',
      'openai/toolInvocation/invoked': 'Search complete',
    },
  }),
};

/**
 * Smart discover movies tool
 * Searches for people (directors/actors) and discovers movies based on criteria
 */
export const DiscoverMoviesSchema = z.object({
  director: z.string().optional().describe('Director name to search for'),
  actor: z.string().optional().describe('Actor name to search for'),
  year: z.number().int().positive().optional().describe('Specific release year filter (e.g., 1999). Cannot be used with decade.'),
  decade: z.number().int().positive().optional().describe('Decade filter (e.g., 1990 for 1990s, 2000 for 2000s). Cannot be used with year.'),
  genre: z.string().optional().describe('Genre name or ID'),
  include_upcoming: z.boolean().optional().describe('Include unreleased movies (default: false, only show released movies)'),
}).refine(
  (data) => !(data.year && data.decade),
  { message: 'Cannot specify both year and decade filters' }
);

export type DiscoverMoviesInput = z.infer<typeof DiscoverMoviesSchema>;

/**
 * Result type for discover movies handler
 */
interface DiscoverMoviesResult {
  message: string;
  useWidget: boolean;
  widgetMeta?: any;
  movies?: any[];
  results: any[];
  count: number;
  searchContext: string;
  suggestion?: string;
  tmdb_id?: number;
}

/**
 * Core handler for discover movies
 */
async function handleDiscoverMovies(validatedInput: DiscoverMoviesInput, userId?: number): Promise<DiscoverMoviesResult> {
    let results;
    let searchContext = '';

    // If director or actor is specified, search for the person first
    if (validatedInput.director || validatedInput.actor) {
      const personName = validatedInput.director || validatedInput.actor;
      const personType = validatedInput.director ? 'director' : 'actor';
      
      console.log(`[discoverMovies] Searching for ${personType}: ${personName}`);
      
      // Search for the person
      const people = await searchPeople(personName!);
      
      if (people.length === 0) {
        throw new Error(`No ${personType} found matching "${personName}". Please check the spelling and try again.`);
      }

      // Use the first (most popular) person result
      const person = people[0];
      console.log(`[discoverMovies] Found ${personType}: ${person.name} (ID: ${person.id})`);
      
      // Discover movies with this person
      const discoverOptions: any = {
        year: validatedInput.year,
        decade: validatedInput.decade,
      };
      
      const genreId = normalizeGenre(validatedInput.genre);
      if (genreId) {
        discoverOptions.with_genres = genreId;
      }
      
      if (validatedInput.director) {
        discoverOptions.with_crew = person.id;
      } else {
        discoverOptions.with_cast = person.id;
      }
      
      // Always sort by popularity (most relevant results first)
      discoverOptions.sort_by = 'popularity.desc';
      
      // Filter to released movies only unless include_upcoming is explicitly true
      if (!validatedInput.include_upcoming) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        discoverOptions['primary_release_date.lte'] = today;
      }

      results = await discoverMovies(discoverOptions);
      
      const genreContext = validatedInput.genre ? ` in ${validatedInput.genre}` : '';
      const yearContext = validatedInput.year ? ` from ${validatedInput.year}` : validatedInput.decade ? ` from the ${validatedInput.decade}s` : '';
      searchContext = `movies with ${person.name} as ${personType}${yearContext}${genreContext}`;
    } else {
      // Fallback to basic discover
      const genreId = normalizeGenre(validatedInput.genre);
      const discoverOptions: any = {
        year: validatedInput.year,
        decade: validatedInput.decade,
        with_genres: genreId,
        sort_by: 'popularity.desc', // Always sort by popularity
      };
      
      // Filter to released movies only unless include_upcoming is explicitly true
      if (!validatedInput.include_upcoming) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        discoverOptions['primary_release_date.lte'] = today;
      }
      
      results = await discoverMovies(discoverOptions);
      
      const genreContext = validatedInput.genre ? ` ${validatedInput.genre}` : '';
      const yearContext = validatedInput.year ? ` from ${validatedInput.year}` : validatedInput.decade ? ` from the ${validatedInput.decade}s` : '';
      searchContext = genreContext || yearContext ? `${genreContext}${yearContext ? ` movies${yearContext}` : ' movies'}`.trim() : 'popular movies';
    }

    // Enrich with user status if authenticated
    if (userId && results.length > 0) {
      results = await enrichMoviesWithUserStatus(results, userId);
    }

    // Only show list widget for multiple results
    const useWidget = Boolean(MOVIE_LIST_WIDGET_URL && results.length > 1);
    
    const widgetMeta = useWidget
      ? {
          'openai/outputTemplate': 'ui://widget/movie-list',
          'openai/widgetAccessible': true,
          'openai/resultCanProduceWidget': true,
          'openai/toolInvocation/invoking': 'Discovering movies...',
          'openai/toolInvocation/invoked': 'Found movies',
        }
      : undefined;

    // For single result, provide guidance to call get_movie_details next
    const singleResultGuidance = results.length === 1
      ? ` To see full details with poster and cast, use get_movie_details with tmdb_id: ${results[0].tmdb_id}`
      : '';

    const message = useWidget 
      ? `🎬 Found ${results.length} ${searchContext}`
      : results.length === 0
      ? `No ${searchContext} found.`
      : `Found "${results[0].title}"${results[0].year ? ` (${results[0].year})` : ''}.${singleResultGuidance}`;

    return {
      message,
      useWidget,
      widgetMeta,
      movies: useWidget ? results : undefined,
      results,
      count: results.length,
      searchContext,
      ...(results.length === 1 && {
        suggestion: 'call_get_movie_details',
        tmdb_id: results[0].tmdb_id,
      }),
    };
}

/**
 * Discover movies with advanced filters
 * Uses tool helper for standardized error handling and response formatting
 */
export const discoverMoviesWithFilters = withToolHandler({
  schema: DiscoverMoviesSchema,
  toolName: 'discover_movies',
  handler: handleDiscoverMovies,
  toTextContent: (result) => result.message,
  toStructuredContent: (result) => ({
    success: true,
    movies: result.movies,
    results: result.results,
    count: result.count,
    message: `Found ${result.count} ${result.searchContext}`,
    ...(result.suggestion && {
      suggestion: result.suggestion,
      tmdb_id: result.tmdb_id,
    }),
  }),
  toMeta: (result) => result.widgetMeta,
  errorMessagePrefix: 'Failed to discover movies',
});

export const discoverMoviesToolDefinition = {
  name: 'discover_movies',
  description: 'Discover movies using advanced filters like director, actor, year, decade, genre, rating, or sort order. This is the SMART search tool - use this when users ask for movies by a specific director, actor, decade (e.g., "90s comedies"), popular movies, highly-rated movies, or other criteria. Unlike search_movies which only searches titles, this tool can find movies by people involved in the film and filter by popularity/rating. SORTING: Results are sorted by POPULARITY by default (showing well-known films first). Only specify sort_by if user explicitly requests a different sort order. BY DEFAULT, only shows RELEASED movies (filters out unreleased/upcoming movies) - use include_upcoming=true if user explicitly wants upcoming releases.',
  inputSchema: {
    type: 'object',
    properties: {
      director: {
        type: 'string',
        description: 'Name of the director (e.g., "Christopher Nolan", "Quentin Tarantino")',
      },
      actor: {
        type: 'string',
        description: 'Name of the actor (e.g., "Tom Hanks", "Meryl Streep")',
      },
      year: {
        type: 'number',
        description: 'Specific release year to filter results (e.g., 1999). Cannot be used with decade.',
      },
      decade: {
        type: 'number',
        description: 'Decade to filter results (e.g., 1990 for 1990s, 2000 for 2000s, 1980 for 1980s). Cannot be used with year.',
      },
      genre: {
        type: 'string',
        description: 'Genre name (e.g., "action", "comedy", "drama", "horror", "thriller", "sci-fi", "romance", "fantasy", "mystery", "animation", "documentary", "crime", "adventure", "family", "war", "western", "history", "music") or TMDB genre ID',
      },
      include_upcoming: {
        type: 'boolean',
        description: 'Include unreleased/upcoming movies in results (default: false). Set to true only if user explicitly asks for upcoming releases like "upcoming movies" or "movies coming in 2025".',
      },
    },
  },
  // Add widget metadata to tool definition
  ...(MOVIE_LIST_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': 'ui://widget/movie-list',
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/toolInvocation/invoking': 'Discovering movies...',
      'openai/toolInvocation/invoked': 'Found movies',
    },
  }),
};

