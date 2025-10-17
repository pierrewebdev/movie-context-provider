/**
 * TMDB API Integration
 * Wrapper functions for The Movie Database API
 * API Documentation: https://developers.themoviedb.org/3
 */

import dotenv from 'dotenv';
import pRetry from 'p-retry';
import { getCached, setCached } from '../cache/redis.js';

dotenv.config();

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w780';
const TMDB_REQUEST_TIMEOUT_MS = 7_500;
const TMDB_MAX_RETRIES = 2;

export function buildImageUrl(path: string | null, type: 'poster' | 'backdrop' = 'poster'): string | null {
  if (!path) return null;
  return type === 'poster' ? `${TMDB_POSTER_BASE_URL}${path}` : `${TMDB_BACKDROP_BASE_URL}${path}`;
}

// Type definitions for TMDB API responses
export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genre_ids: number[];
}

export interface MovieResult {
  tmdb_id: number;
  title: string;
  year: number | null;
  release_date: string | null;
  overview: string;
  poster_url: string | null;
  poster_path: string | null;
  backdrop_url: string | null;
  backdrop_path: string | null;
  rating: number;
}

export interface MovieCastMember {
  id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
  profile_url: string | null;
  order: number;
}

export interface MovieImageAsset {
  file_path: string;
  aspect_ratio: number;
  width: number;
  height: number;
  url: string;
}

export interface MovieDetails extends MovieResult {
  runtime: number | null;
  tagline: string | null;
  status: string | null;
  release_date_full: string | null;
  genres: { id: number; name: string }[];
  director: string | null;
  budget: number | null;
  revenue: number | null;
  homepage: string | null;
  imdb_id: string | null;
  cast: MovieCastMember[];
  posters: MovieImageAsset[];
  backdrops: MovieImageAsset[];
  warnings?: string[];
}

export interface TMDBSearchResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

/**
 * Search for movies by title
 * @param query - Search query string
 * @param year - Optional release year filter
 * @param _genre - Optional genre filter (not implemented in basic version)
 * @returns Array of movie results
 */
async function fetchJsonWithRetry<T>(url: string): Promise<T> {
  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TMDB_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`TMDB resource not found (404): ${url}`);
          }
          throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      retries: TMDB_MAX_RETRIES,
      factor: 2,
      onFailedAttempt: (error) => {
        console.warn(`[TMDB] attempt ${error.attemptNumber} failed (${error.retriesLeft} retries left)`);
      },
    }
  );
}

export async function searchMovies(
  query: string,
  year?: number,
  _genre?: string
): Promise<MovieResult[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }

  try {
    // Build query parameters
    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: query,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    });

    // Add optional year filter
    if (year) {
      params.append('year', year.toString());
    }

    const url = `${TMDB_BASE_URL}/search/movie?${params}`;
    const data = await fetchJsonWithRetry<TMDBSearchResponse>(url);

    // Transform TMDB response to our format
    return data.results.map((movie) => ({
      tmdb_id: movie.id,
      title: movie.title,
      year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null,
      release_date: movie.release_date || null,
      overview: movie.overview,
      poster_path: movie.poster_path,
      poster_url: buildImageUrl(movie.poster_path, 'poster'),
      backdrop_path: movie.backdrop_path,
      backdrop_url: buildImageUrl(movie.backdrop_path, 'backdrop'),
      rating: Math.round(movie.vote_average * 10) / 10, // Round to 1 decimal
    }));
  } catch (error) {
    console.error('Error searching movies:', error);
    throw new Error(`Failed to search movies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get detailed information about a specific movie
 * @param tmdbId - TMDB movie ID
 * @returns Movie details
 */
interface TMDBDetailedMovie extends TMDBMovie {
  backdrop_path: string | null;
  runtime: number | null;
  tagline: string | null;
  status: string | null;
  genres: { id: number; name: string }[];
  budget: number;
  revenue: number;
  homepage: string | null;
  imdb_id: string | null;
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string | null;
      profile_path: string | null;
      order: number;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      department: string;
    }>;
  };
  images?: {
    posters: Array<{
      file_path: string;
      width: number;
      height: number;
      aspect_ratio: number;
    }>;
    backdrops: Array<{
      file_path: string;
      width: number;
      height: number;
      aspect_ratio: number;
    }>;
  };
}

export async function getMovieDetails(tmdbId: number): Promise<MovieDetails> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }

  // Try to get from cache first
  const cacheKey = `tmdb:movie:${tmdbId}`;
  const cached = await getCached<MovieDetails>(cacheKey);
  if (cached) {
    console.log(`[Cache HIT] getMovieDetails: ${tmdbId}`);
    return cached;
  }

  console.log(`[Cache MISS] getMovieDetails: ${tmdbId}`);

  try {
    const baseParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'en-US',
      append_to_response: 'credits',
    });
    const url = `${TMDB_BASE_URL}/movie/${tmdbId}?${baseParams}`;

    const movie = await fetchJsonWithRetry<TMDBDetailedMovie>(url);

    // Process cast data
    const cast: MovieCastMember[] = (movie.credits?.cast ?? [])
      .slice(0, 10) // Get top 10 cast members
      .map(member => ({
        id: member.id,
        name: member.name,
        character: member.character ?? null,
        profile_path: member.profile_path,
        profile_url: member.profile_path 
          ? `https://image.tmdb.org/t/p/w185${member.profile_path}`
          : null,
        order: member.order,
      }));

    // Extract director from crew
    const director = movie.credits?.crew?.find(member => member.job === 'Director')?.name ?? null;

    const movieDetails: MovieDetails = {
      tmdb_id: movie.id,
      title: movie.title,
      year: movie.release_date ? parseInt(movie.release_date.split('-')[0], 10) : null,
      release_date: movie.release_date || null,
      overview: movie.overview,
      poster_path: movie.poster_path,
      poster_url: buildImageUrl(movie.poster_path, 'poster'),
      backdrop_path: movie.backdrop_path,
      backdrop_url: buildImageUrl(movie.backdrop_path, 'backdrop'),
      rating: Math.round(movie.vote_average * 10) / 10,
      runtime: movie.runtime,
      tagline: movie.tagline,
      status: movie.status ?? null,
      release_date_full: movie.release_date ?? null,
      genres: movie.genres ?? [],
      director,
      budget: movie.budget > 0 ? movie.budget : null,
      revenue: movie.revenue > 0 ? movie.revenue : null,
      homepage: movie.homepage ?? null,
      imdb_id: movie.imdb_id ?? null,
      cast,
      posters: [],
      backdrops: [],
    };

    // Cache for 30 days (movie details are immutable)
    await setCached(cacheKey, movieDetails, 60 * 60 * 24 * 30);

    return movieDetails;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching movie details:', error);
    throw new Error(`Failed to fetch movie details: ${message}`);
  }
}

/**
 * Search for people (actors, directors, etc.)
 * @param query - Person's name
 * @returns Array of people matching the search
 */
export interface TMDBPerson {
  id: number;
  name: string;
  known_for_department: string;
  profile_path: string | null;
  popularity: number;
}

export interface PersonResult {
  id: number;
  name: string;
  known_for: string;
  profile_url: string | null;
}

interface TMDBPersonSearchResponse {
  page: number;
  results: TMDBPerson[];
  total_pages: number;
  total_results: number;
}

export async function searchPeople(query: string): Promise<PersonResult[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }

  // Create cache key (normalize query to lowercase for consistency)
  const cacheKey = `tmdb:person:search:${query.toLowerCase()}`;
  
  // Try to get from cache first
  const cached = await getCached<PersonResult[]>(cacheKey);
  if (cached) {
    console.log(`[Cache HIT] searchPeople: ${query}`);
    return cached;
  }
  
  console.log(`[Cache MISS] searchPeople: ${query}`);

  try {
    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: query,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    });

    const url = `${TMDB_BASE_URL}/search/person?${params}`;
    const data = await fetchJsonWithRetry<TMDBPersonSearchResponse>(url);

    const results = data.results.map((person) => ({
      id: person.id,
      name: person.name,
      known_for: person.known_for_department || 'Unknown',
      profile_url: person.profile_path 
        ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
        : null,
    }));
    
    // Cache for 7 days (person data rarely changes)
    await setCached(cacheKey, results, 60 * 60 * 24 * 7);
    
    return results;
  } catch (error) {
    console.error('Error searching people:', error);
    throw new Error(`Failed to search people: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Discover movies with advanced filters (genre, cast, crew, etc.)
 * @param options - Filter options
 * @returns Array of movie results
 */
export interface DiscoverMoviesOptions {
  with_cast?: number; // Person ID
  with_crew?: number; // Person ID
  with_genres?: string; // Comma-separated genre IDs
  sort_by?: string; // e.g., 'popularity.desc', 'vote_average.desc'
  year?: number;
  decade?: number; // e.g., 1990 for 1990s
  page?: number;
  'vote_average.gte'?: number; // Minimum rating (0-10)
  'vote_count.gte'?: number; // Minimum vote count
  'primary_release_date.lte'?: string; // Max release date (YYYY-MM-DD)
  'primary_release_date.gte'?: string; // Min release date (YYYY-MM-DD)
}

export async function discoverMovies(options: DiscoverMoviesOptions = {}): Promise<MovieResult[]> {
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }

  try {
    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      include_adult: 'false',
      language: 'en-US',
      page: (options.page || 1).toString(),
      sort_by: options.sort_by || 'popularity.desc',
    });

    if (options.with_cast) {
      params.append('with_cast', options.with_cast.toString());
    }
    if (options.with_crew) {
      params.append('with_crew', options.with_crew.toString());
    }
    if (options.with_genres) {
      params.append('with_genres', options.with_genres);
    }
    if (options.year) {
      params.append('primary_release_year', options.year.toString());
    }
    // Handle decade filter (e.g., 1990 = 1990-1999)
    if (options.decade) {
      const startYear = options.decade;
      const endYear = options.decade + 9;
      params.append('primary_release_date.gte', `${startYear}-01-01`);
      params.append('primary_release_date.lte', `${endYear}-12-31`);
    }
    if (options['vote_average.gte']) {
      params.append('vote_average.gte', options['vote_average.gte'].toString());
    }
    if (options['vote_count.gte']) {
      params.append('vote_count.gte', options['vote_count.gte'].toString());
    }
    // Allow manual override of date filters if not using decade
    if (!options.decade && options['primary_release_date.lte']) {
      params.append('primary_release_date.lte', options['primary_release_date.lte']);
    }
    if (!options.decade && options['primary_release_date.gte']) {
      params.append('primary_release_date.gte', options['primary_release_date.gte']);
    }

    const url = `${TMDB_BASE_URL}/discover/movie?${params}`;
    const data = await fetchJsonWithRetry<TMDBSearchResponse>(url);

    return data.results.map((movie) => ({
      tmdb_id: movie.id,
      title: movie.title,
      year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null,
      release_date: movie.release_date || null,
      overview: movie.overview,
      poster_path: movie.poster_path,
      poster_url: buildImageUrl(movie.poster_path, 'poster'),
      backdrop_path: movie.backdrop_path,
      backdrop_url: buildImageUrl(movie.backdrop_path, 'backdrop'),
      rating: Math.round(movie.vote_average * 10) / 10,
    }));
  } catch (error) {
    console.error('Error discovering movies:', error);
    throw new Error(`Failed to discover movies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate TMDB API configuration
 * Useful for startup checks
 */
export async function validateTMDBConfig(): Promise<boolean> {
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY not configured');
    return false;
  }

  try {
    // Test with a simple search
    await searchMovies('test', undefined, undefined);
    return true;
  } catch (error) {
    console.error('TMDB API validation failed:', error);
    return false;
  }
}

