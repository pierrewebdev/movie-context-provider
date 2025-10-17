import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cssContent from '../styles.css?inline';
import { FaStar, FaRegStar, FaStarHalfAlt, FaCheck, FaPlus, FaTimes, FaEye, FaClock, FaFilm, FaHeart, FaRegHeart } from 'react-icons/fa';
import {
  useOpenAiGlobal,
  ButtonSpinner,
  LoadingSpinner,
  addToWatchlist,
  markAsWatched as markAsWatchedApi,
  setWidgetState as setWidgetStateApi,
  callTool,
  type WatchlistToolResponse,
} from './shared/index.js';

// Types
type WatchlistResponse = WatchlistToolResponse;

type CastMember = {
  id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
  profile_url: string | null;
  order: number;
};

type Movie = {
  tmdb_id: number;
  title: string;
  year: number | null;
  overview: string;
  poster_url: string | null;
  rating?: number | null;
  tagline?: string | null;
  director?: string | null;
  runtime?: number | null;
  budget?: number | null;
  revenue?: number | null;
  genres?: { id: number; name: string }[];
  cast?: CastMember[];
};

type ToolOutput = {
  success: boolean;
  movie?: Movie;
  watchlist?: Movie[];
} | null;

type WidgetState = {
  lastAddedId?: number;
};

// Hooks
function useWidgetState() {
  const widgetState = useOpenAiGlobal('widgetState');

  const setWidgetState = useCallback(async (state: WidgetState) => {
    setWidgetStateApi(state);
  }, []);

  return [widgetState, setWidgetState] as const;
}

function useToolOutput(): ToolOutput {
  return useOpenAiGlobal('toolOutput');
}

function useTheme() {
  return useOpenAiGlobal('theme');
}

function useDisplayMode() {
  return useOpenAiGlobal('displayMode');
}

// Helpers
function formatCurrency(amount: number): string {
  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(2)}B`;
  } else if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount}`;
}

function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Components
function StarRating({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null;
  
  // Convert 10-point to 5-star scale (keep decimal for accurate half-star calculation)
  const stars = rating / 2;
  const fullStars = Math.floor(stars);
  const halfStar = (stars - fullStars) >= 0.5;
  
  return (
    <div className="flex items-center gap-2 -my-1.5">
      <span className="flex items-center text-amber-500">
        {Array.from({ length: fullStars }, (_, i) => (
          <FaStar key={`full-${i}`} className="w-4 h-4" />
        ))}
        {halfStar && <FaStarHalfAlt className="w-4 h-4" />}
        {Array.from({ length: 5 - fullStars - (halfStar ? 1 : 0) }, (_, i) => (
          <FaRegStar key={`empty-${i}`} className="w-4 h-4 opacity-25" />
        ))}
      </span>
      <span className="text-sm font-semibold text-gray-900/70 dark:text-gray-50/70">{rating}/10</span>
    </div>
  );
}

async function addMovieToWatchlist(tmdbId: number | undefined): Promise<WatchlistResponse> {
  if (!tmdbId) {
    return { success: false, message: 'Movie ID unavailable' };
  }

  try {
    return await addToWatchlist({ tmdb_id: tmdbId });
  } catch (error) {
    console.error('Failed to add to watchlist', error);
    return { success: false, message: 'Could not add to watchlist. Please try again.' };
  }
}

async function markMovieAsWatched(tmdbId: number | undefined, rating: number): Promise<WatchlistResponse> {
  if (!tmdbId) {
    return { success: false, message: 'Movie ID unavailable' };
  }

  try {
    return await markAsWatchedApi({ tmdb_id: tmdbId, rating });
  } catch (error) {
    console.error('Failed to mark as watched', error);
    return { success: false, message: 'Could not mark as watched. Please try again.' };
  }
}

function MoviePosterWidget() {
  console.log('[MoviePosterWidget] mounted');
  console.log('[MoviePosterWidget] window.openai exists:', typeof window !== 'undefined' && 'openai' in window);
  
  const toolOutput = useToolOutput();
  const theme = useTheme();
  const displayMode = useDisplayMode();
  const [widgetState, setWidgetState] = useWidgetState();
  const [watchlistStatus, setWatchlistStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [watchedStatus, setWatchedStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [showRatingSelector, setShowRatingSelector] = useState(false);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [addingActorId, setAddingActorId] = useState<number | null>(null);
  const [favoriteActors, setFavoriteActors] = useState<Set<string>>(new Set());

  // Load existing favorite actors on mount
  useEffect(() => {
    async function loadFavorites() {
      try {
        const prefsResponse = await callTool('get_preferences', {});
        const existingActors = prefsResponse?.preferences?.find((p: any) => p.key === 'favorite_actors')?.value || [];
        const actorNames = existingActors.map((a: any) => 
          typeof a === 'string' ? a : (typeof a === 'object' && a !== null && 'name' in a ? a.name : null)
        ).filter(Boolean);
        setFavoriteActors(new Set(actorNames));
      } catch (error) {
        console.error('Failed to load favorite actors:', error);
      }
    }
    loadFavorites();
  }, []);

  console.log('[MoviePosterWidget] toolOutput:', toolOutput);
  console.log('[MoviePosterWidget] theme:', theme);
  console.log('[MoviePosterWidget] displayMode:', displayMode);

  const movie = useMemo<Movie | null>(() => {
    console.log('[MoviePosterWidget] extracting movie from toolOutput:', toolOutput);
    if (!toolOutput) {
      console.log('[MoviePosterWidget] No toolOutput!');
      return null;
    }
    const anyOut: any = toolOutput as any;
    
    // Try structuredContent.movie first (primary location)
    if (anyOut?.structuredContent?.movie) {
      console.log('[MoviePosterWidget] Found movie in toolOutput.structuredContent.movie');
      return anyOut.structuredContent.movie as Movie;
    }
    
    // Try result.structuredContent.movie (OpenAI MCP wrapper)
    if (anyOut?.result?.structuredContent?.movie) {
      console.log('[MoviePosterWidget] Found movie in toolOutput.result.structuredContent.movie');
      return anyOut.result.structuredContent.movie as Movie;
    }
    
    // Try direct movie property
    if (anyOut?.movie) {
      console.log('[MoviePosterWidget] Found movie in toolOutput.movie');
      return anyOut.movie as Movie;
    }
    
    console.log('[MoviePosterWidget] No movie found in toolOutput structure, keys:', Object.keys(anyOut));
    return null;
  }, [toolOutput]);

  // Initialize status from movie data
  useEffect(() => {
    if (!movie) return;
    
    const anyMovie: any = movie;
    
    // Check if movie is in watchlist
    if (anyMovie.inWatchlist === true) {
      setWatchlistStatus('success');
    }
    
    // Check if movie is watched
    if (anyMovie.isWatched === true) {
      setWatchedStatus('success');
    }
  }, [movie]);

  useEffect(() => {
    if (widgetState?.lastAddedId && widgetState.lastAddedId === movie?.tmdb_id) {
      setWatchlistStatus('success');
    }
  }, [widgetState?.lastAddedId, movie?.tmdb_id]);

  const handleAddToWatchlist = useCallback(async () => {
    if (!movie || watchlistStatus === 'loading') return;
    setWatchlistStatus('loading');

    const result = await addMovieToWatchlist(movie.tmdb_id);
    
    if (result.success) {
      setWatchlistStatus('success');
      await setWidgetState({ lastAddedId: movie.tmdb_id });
    } else {
      setWatchlistStatus('error');
      // Reset to idle after 3 seconds
      setTimeout(() => setWatchlistStatus('idle'), 3000);
    }
  }, [movie, watchlistStatus, setWidgetState]);

  const handleMarkAsWatched = useCallback(async (rating?: number) => {
    if (!movie || watchedStatus === 'loading') return;
    
    // If no rating provided, show the rating selector
    if (rating === undefined) {
      setShowRatingSelector(true);
      return;
    }
    
    // Rating provided, proceed with marking as watched
    setWatchedStatus('loading');
    setShowRatingSelector(false);

    const result = await markMovieAsWatched(movie.tmdb_id, rating);
    
    if (result.success) {
      setWatchedStatus('success');
    } else {
      setWatchedStatus('error');
      // Reset to idle after 3 seconds
      setTimeout(() => setWatchedStatus('idle'), 3000);
    }
  }, [movie, watchedStatus]);

  if (!movie) {
    return (
      <div className={`font-sans min-h-full box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
        <LoadingSpinner message="Loading movie details..." />
      </div>
    );
  }

  const baseButtonClasses = "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border-none text-sm font-medium cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-80 disabled:cursor-not-allowed hover:enabled:-translate-y-px";
  
  const watchlistButtonClasses = `${baseButtonClasses} ${
    watchlistStatus === 'success' 
      ? 'bg-green-600 text-gray-50 shadow-lg shadow-green-600/25 disabled:opacity-100 disabled:cursor-default' 
      : watchlistStatus === 'error'
      ? 'bg-red-500 text-gray-50 shadow-lg shadow-red-500/25 hover:enabled:shadow-xl hover:enabled:shadow-red-500/30'
      : 'bg-blue-600 text-gray-50 shadow-lg shadow-blue-600/25 hover:enabled:shadow-xl hover:enabled:shadow-blue-600/30'
  }`;
  
  const watchedButtonClasses = `${baseButtonClasses} ${
    watchedStatus === 'success' 
      ? 'bg-green-600 text-gray-50 shadow-lg shadow-green-600/25 disabled:opacity-100 disabled:cursor-default' 
      : watchedStatus === 'error'
      ? 'bg-red-500 text-gray-50 shadow-lg shadow-red-500/25 hover:enabled:shadow-xl hover:enabled:shadow-red-500/30'
      : 'bg-purple-600 text-gray-50 shadow-lg shadow-purple-600/25 hover:enabled:shadow-xl hover:enabled:shadow-purple-600/30'
  }`;

  return (
    <div className={`font-sans min-h-full p-3 box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
      <div className="flex gap-4 items-start">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={`${movie.title} poster`}
            className="w-40 rounded-xl shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
          />
        ) : (
          <div className="w-40 h-60 grid place-items-center rounded-xl bg-white/8 border border-dashed border-gray-800/20">
            No poster available
          </div>
        )}

        <div className="flex-1 flex flex-col gap-3">
          <h2 className="m-0 text-2xl font-semibold flex items-baseline gap-2">
            {movie.title}
            {movie.year ? (
              <span className={`text-base ${theme === 'dark' ? 'text-gray-50/65' : 'text-gray-900/60'}`}>
                ({movie.year})
              </span>
            ) : null}
          </h2>
          
          {/* Movie metadata */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {movie.director && (
              <span className={`flex items-center gap-1.5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <FaFilm className="w-3 h-3" />
                <span className="font-medium">{movie.director}</span>
              </span>
            )}
            {movie.runtime && (
              <span className={`flex items-center gap-1.5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <FaClock className="w-3 h-3" />
                {formatRuntime(movie.runtime)}
              </span>
            )}
            {movie.genres && movie.genres.length > 0 && (
              <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {movie.genres.slice(0, 3).map(g => g.name).join(' • ')}
              </span>
            )}
          </div>

          <StarRating rating={movie.rating} />
          
          {/* Box office stats */}
          {(movie.budget || movie.revenue) && (
            <div className="flex gap-4 text-xs">
              {movie.budget && (
                <div className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  <span className="font-semibold">Budget:</span> {formatCurrency(movie.budget)}
                </div>
              )}
              {movie.revenue && (
                <div className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  <span className="font-semibold">Revenue:</span> {formatCurrency(movie.revenue)}
                </div>
              )}
            </div>
          )}
          
          {/* Description */}
          <div>
            <p className={`m-0 leading-relaxed ${isDescriptionExpanded ? '' : 'max-h-[4.5rem] overflow-hidden'} ${theme === 'dark' ? 'text-gray-50/82' : 'text-gray-900/80'}`}>
              {movie.overview}
            </p>
            {movie.overview && movie.overview.length > 200 && (
              <button
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className={`text-xs mt-1 hover:underline ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}
              >
                {isDescriptionExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
          
          {movie.cast && movie.cast.length > 0 && (
            <div className="my-1.5">
              <h3 className={`m-0 mb-2 text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-50/60' : 'text-gray-900/60'}`}>
                Cast
              </h3>
              <div className="flex flex-col gap-2">
                {movie.cast.map((member) => {
                  const isFavorite = favoriteActors.has(member.name);
                  return (
                  <div key={member.id} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                    isFavorite
                      ? theme === 'dark' 
                        ? 'bg-pink-500/10 border border-pink-500/30' 
                        : 'bg-pink-50 border border-pink-200'
                      : theme === 'dark' 
                        ? 'bg-gray-800/50 border border-transparent' 
                        : 'bg-gray-100 border border-transparent'
                  }`}>
                    {/* Profile picture */}
                    <div className="flex-shrink-0">
                      {member.profile_url ? (
                        <img
                          src={member.profile_url}
                          alt={member.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}>
                          <span className={`text-xl ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            👤
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Actor info */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
                        {member.name}
                      </div>
                      {member.character && (
                        <div className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                          as {member.character}
                        </div>
                      )}
                    </div>
                    
                    {/* Add to favorites button */}
                    <button
                      onClick={async () => {
                        setAddingActorId(member.id);
                        
                        try {
                          // Get existing favorites first
                          const prefsResponse = await callTool('get_preferences', {});
                          const existingActors = prefsResponse?.preferences?.find((p: any) => p.key === 'favorite_actors')?.value || [];
                          
                          // Check if already in favorites
                          const actorNames = existingActors.map((a: any) => 
                            typeof a === 'string' ? a : a.name
                          );
                          
                          if (!actorNames.includes(member.name)) {
                            // Append new actor to existing list
                            await callTool('set_preferences', {
                              preferences: [{
                                key: 'favorite_actors',
                                value: [...actorNames, member.name]
                              }]
                            });
                          }
                          
                          // Update local state
                          setFavoriteActors(prev => {
                            const next = new Set(prev);
                            next.add(member.name);
                            return next;
                          });
                        } catch (error) {
                          console.error('Failed to add actor to favorites:', error);
                        } finally {
                          setAddingActorId(null);
                        }
                      }}
                      disabled={addingActorId === member.id}
                      className={`flex-shrink-0 p-1.5 rounded-full transition-all ${
                        favoriteActors.has(member.name)
                          ? theme === 'dark'
                            ? 'text-pink-400'
                            : 'text-pink-600'
                          : theme === 'dark'
                          ? 'hover:bg-gray-700 text-gray-400 hover:text-pink-400'
                          : 'hover:bg-gray-200 text-gray-600 hover:text-pink-600'
                      } ${addingActorId === member.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={favoriteActors.has(member.name) ? `${member.name} is in favorites` : `Add ${member.name} to favorites`}
                    >
                      {addingActorId === member.id ? (
                        <ButtonSpinner />
                      ) : favoriteActors.has(member.name) ? (
                        <FaHeart className="w-3 h-3" />
                      ) : (
                        <FaRegHeart className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="flex gap-2.5 flex-wrap items-center">
            {/* Only show watchlist button if movie is not already watched (from data or current session) */}
            {!(movie as any).isWatched && watchedStatus !== 'success' && (
              <button
                type="button"
                className={watchlistButtonClasses}
                onClick={handleAddToWatchlist}
                disabled={watchlistStatus === 'loading' || watchlistStatus === 'success'}
                aria-label="Add to watchlist"
              >
                <span className="text-lg font-semibold">
                  {watchlistStatus === 'success' ? <FaCheck /> : watchlistStatus === 'loading' ? <ButtonSpinner /> : <FaPlus />}
                </span>
                {watchlistStatus === 'success' 
                  ? 'Added to watchlist' 
                  : watchlistStatus === 'loading'
                  ? 'Adding...'
                  : watchlistStatus === 'error'
                  ? 'Try again'
                  : 'Add to watchlist'}
              </button>
            )}
            
            {showRatingSelector && watchedStatus === 'idle' ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/10 border border-purple-600/30">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
                  Rate:
                </span>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    className="text-lg transition-transform hover:scale-125 cursor-pointer"
                    onMouseEnter={() => setHoveredRating(rating)}
                    onMouseLeave={() => setHoveredRating(0)}
                    onClick={() => handleMarkAsWatched(rating)}
                    aria-label={`Rate ${rating} stars`}
                  >
                    <FaStar className={hoveredRating >= rating ? 'text-amber-500' : 'text-gray-400'} />
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={() => setShowRatingSelector(false)}
                  aria-label="Cancel"
                >
                  <FaTimes />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={watchedButtonClasses}
                onClick={() => handleMarkAsWatched()}
                disabled={watchedStatus === 'loading' || watchedStatus === 'success'}
                aria-label="Mark as watched"
              >
                <span className="text-lg font-semibold">
                  {watchedStatus === 'success' ? <FaCheck /> : watchedStatus === 'loading' ? <ButtonSpinner /> : <FaEye />}
                </span>
                {watchedStatus === 'success' 
                  ? 'Watched it' 
                  : watchedStatus === 'loading'
                  ? 'Marking...'
                  : watchedStatus === 'error'
                  ? 'Try again'
                  : 'Mark as watched'}
              </button>
            )}
          </div>
          
          {/* Show user rating and notes if movie is watched */}
          {(movie as any).isWatched && (movie as any).userRating && (
            <div className={`mt-3 p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-100/70'}`}>
              <div className="flex items-center gap-2 mb-1">
                <FaStar className="text-amber-500 text-lg" />
                <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
                  Your rating: {(movie as any).userRating}/5
                </span>
              </div>
              {(movie as any).userNotes && (
                <p className={`text-sm mt-2 leading-relaxed ${theme === 'dark' ? 'text-gray-50/70' : 'text-gray-900/70'}`}>
                  {(movie as any).userNotes}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* TMDB Attribution - Required by TMDB API Terms */}
      <div className="mt-4 text-center">
        <a 
          href="https://www.themoviedb.org" 
          target="_blank" 
          rel="noopener noreferrer"
          className={`text-xs ${theme === 'dark' ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-500'} no-underline transition-colors`}
        >
          Data from TMDB
        </a>
      </div>
    </div>
  );
}

// Bootstrap
// Inject CSS into the document
function injectStyles() {
  // Check if styles are already injected
  if (document.getElementById('movie-poster-widget-styles')) {
    return;
  }
  
  const styleElement = document.createElement('style');
  styleElement.id = 'movie-poster-widget-styles';
  styleElement.textContent = cssContent;
  document.head.appendChild(styleElement);
}

function bootstrap() {
  // Inject CSS first
  injectStyles();
  
  const container = document.getElementById('movie-poster-widget-root');
  if (!container) {
    console.error('MoviePosterWidget: root element not found');
    return;
  }

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <MoviePosterWidget />
    </StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

