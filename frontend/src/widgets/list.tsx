import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cssContent from '../styles.css?inline';
import { FaStar } from 'react-icons/fa';
import {
  useOpenAiGlobal,
  ButtonSpinner,
  LoadingSpinner,
  addToWatchlist,
  removeFromWatchlist,
  markAsWatched as markAsWatchedApi,
} from './shared/index.js';

// Types
type Movie = {
  tmdb_id: number;
  title: string;
  year: number | null;
  release_date?: string | null;
  poster_url: string | null;
  rating?: number;
  overview?: string;
};

type ToolOutput = {
  success: boolean;
  movies?: Movie[];
} | null;

// Hooks
function useToolOutput(): ToolOutput {
  return useOpenAiGlobal('toolOutput');
}

function useTheme() {
  return useOpenAiGlobal('theme');
}

function useDisplayMode() {
  return useOpenAiGlobal('displayMode');
}

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

// Components
function MovieListItem({ movie, hideWatchlistButton }: { movie: Movie; hideWatchlistButton?: boolean }) {
  const [watchlistStatus, setWatchlistStatus] = useState<ActionStatus>('idle');
  const [watchedStatus, setWatchedStatus] = useState<ActionStatus>('idle');
  const [showRatingSelector, setShowRatingSelector] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<number>(0);

  // Check if movie has been released
  const isReleased = useMemo(() => {
    if (!movie.release_date) return true; // Assume released if no date
    const releaseDate = new Date(movie.release_date);
    return releaseDate <= new Date();
  }, [movie.release_date]);

  // Initialize status from movie data
  useEffect(() => {
    const anyMovie: any = movie;
    
    // Initialize states based on movie data (derived state)
    const initialWatchlistStatus = anyMovie.inWatchlist === true ? 'success' : 'idle';
    const initialWatchedStatus = anyMovie.isWatched === true ? 'success' : 'idle';
    
    setWatchlistStatus(initialWatchlistStatus);
    setWatchedStatus(initialWatchedStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.tmdb_id]); // Only re-run when movie changes (by ID)

  const handleAddToWatchlist = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchlistStatus === 'loading' || watchlistStatus === 'success') return;
    
    setWatchlistStatus('loading');
    try {
      const response = await addToWatchlist({ tmdb_id: movie.tmdb_id });
      setWatchlistStatus(response.success ? 'success' : 'error');
      if (!response.success) {
        setTimeout(() => setWatchlistStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Failed to add to watchlist', error);
      setWatchlistStatus('error');
      setTimeout(() => setWatchlistStatus('idle'), 2000);
    }
  }, [movie.tmdb_id, watchlistStatus]);

  const handleRemoveFromWatchlist = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchlistStatus === 'loading') return;
    
    setWatchlistStatus('loading');
    try {
      const response = await removeFromWatchlist(movie.tmdb_id);
      if (response.success) {
        // On successful remove, set to idle (button disappears or changes)
        setWatchlistStatus('idle');
      } else {
        setWatchlistStatus('error');
        setTimeout(() => setWatchlistStatus('success'), 2000); // Revert to success state
      }
    } catch (error) {
      console.error('Failed to remove from watchlist', error);
      setWatchlistStatus('error');
      setTimeout(() => setWatchlistStatus('success'), 2000); // Revert to success state
    }
  }, [movie.tmdb_id, watchlistStatus]);

  const handleMarkAsWatched = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchedStatus === 'loading' || watchedStatus === 'success') return;
    
    // Show rating selector instead of immediately marking
    setShowRatingSelector(true);
    setHoveredRating(0);
  }, [watchedStatus]);

  const handleRatingSelect = useCallback(async (e: React.MouseEvent, rating: number) => {
    e.stopPropagation();
    setWatchedStatus('loading');
    setShowRatingSelector(false);
    setHoveredRating(0);
    
    try {
      const response = await markAsWatchedApi({ tmdb_id: movie.tmdb_id, rating });
      setWatchedStatus(response.success ? 'success' : 'error');
      if (!response.success) {
        setTimeout(() => setWatchedStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Failed to mark as watched', error);
      setWatchedStatus('error');
      setTimeout(() => setWatchedStatus('idle'), 2000);
    }
  }, [movie.tmdb_id]);

  const baseIconBtnClasses = "w-9 h-9 rounded-full border-none text-white text-base grid place-items-center cursor-pointer transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed hover:enabled:scale-110 hover:enabled:shadow-md active:enabled:scale-95";
  
  const watchlistBtnClasses = `${baseIconBtnClasses} ${
    watchlistStatus === 'success' 
      ? 'bg-green-600 shadow-green-600/25 hover:enabled:shadow-green-600/35 disabled:opacity-100 disabled:cursor-default' 
      : 'bg-blue-600 shadow-blue-600/25 hover:enabled:shadow-blue-600/35'
  }`;
  
  const watchedBtnClasses = `${baseIconBtnClasses} ${
    watchedStatus === 'success' 
      ? 'bg-green-600 shadow-green-600/25 hover:enabled:shadow-green-600/35 disabled:opacity-100 disabled:cursor-default' 
      : 'bg-blue-600 shadow-blue-600/25 hover:enabled:shadow-blue-600/35'
  }`;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50/50 dark:bg-gray-800/40 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
      <div className="flex-shrink-0 w-[50px] h-[75px]">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={`${movie.title} poster`}
            className="w-full h-full object-cover rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          />
        ) : (
          <div className="w-full h-full grid place-items-center rounded-md bg-gray-400/20 border border-dashed border-gray-400/40 text-2xl text-gray-400/60">
            ?
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <h3 className="m-0 text-sm font-semibold leading-snug overflow-hidden text-ellipsis line-clamp-2">
          {movie.title}
        </h3>
        
        {/* Year and ratings row */}
        <div className="flex items-center gap-2 flex-wrap">
          {movie.year && (
            <span className="text-xs text-gray-500/80 dark:text-gray-400/80">
              {movie.year}
            </span>
          )}
          {movie.rating ? (
            <span className="text-xs text-amber-500 font-medium flex items-center gap-0.5">
              <FaStar className="w-3 h-3" /> {typeof movie.rating === 'number' ? movie.rating.toFixed(1) : Number(movie.rating).toFixed(1)}/10
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              N/A
            </span>
          )}
          {(movie as any).isWatched && (movie as any).userRating && (
            <span className="text-xs text-green-500 font-medium flex items-center gap-0.5">
              You: <FaStar className="w-3 h-3" /> {(movie as any).userRating}/5
            </span>
          )}
        </div>
        
        {/* Description */}
        {movie.overview && (
          <p className="m-0 text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
            {movie.overview}
          </p>
        )}
      </div>

      {/* Rating selector or action buttons */}
      {showRatingSelector ? (
        <div 
          className="flex items-center gap-1.5 flex-shrink-0"
          onMouseLeave={() => setHoveredRating(0)}
        >
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              onClick={(e) => handleRatingSelect(e, rating)}
              onMouseEnter={() => setHoveredRating(rating)}
              className={`w-7 h-7 rounded-full border-none text-white text-base grid place-items-center cursor-pointer transition-all shadow-sm hover:scale-110 hover:shadow-md active:scale-95 ${
                rating <= hoveredRating ? 'bg-yellow-500 hover:bg-yellow-400' : 'bg-gray-600 hover:bg-gray-500'
              }`}
              title={`${rating} star${rating > 1 ? 's' : ''}`}
              aria-label={`Rate ${rating} star${rating > 1 ? 's' : ''}`}
            >
              <FaStar />
            </button>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowRatingSelector(false);
              setHoveredRating(0);
            }}
            className="w-7 h-7 rounded-full border-none bg-gray-500 text-white text-xs grid place-items-center cursor-pointer transition-all shadow-sm hover:scale-110 hover:shadow-md hover:bg-gray-400 active:scale-95"
            title="Cancel"
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex gap-2 flex-shrink-0">
          {/* Only show watchlist button if not hidden and movie is not already watched */}
          {!hideWatchlistButton && !(movie as any).isWatched && watchedStatus !== 'success' && (
            <>
              {watchlistStatus === 'success' ? (
                <button
                  className={`${baseIconBtnClasses} bg-orange-600 shadow-orange-600/25 hover:enabled:shadow-orange-600/35`}
                  onClick={handleRemoveFromWatchlist}
                  disabled={false}
                  title="Remove from watchlist"
                  aria-label="Remove from watchlist"
                >
                  −
                </button>
              ) : (
                <button
                  className={watchlistBtnClasses}
                  onClick={handleAddToWatchlist}
                  disabled={watchlistStatus === 'loading'}
                  title="Add to watchlist"
                  aria-label="Add to watchlist"
                >
                  {watchlistStatus === 'loading' ? <ButtonSpinner /> : '+'}
                </button>
              )}
            </>
          )}
          <button
            className={watchedBtnClasses}
            onClick={handleMarkAsWatched}
            disabled={!isReleased || watchedStatus === 'loading' || watchedStatus === 'success'}
            title={!isReleased ? "Can't mark as watched - not released yet" : "Mark as watched"}
            aria-label="Mark as watched"
          >
            {watchedStatus === 'success' ? '✓' : watchedStatus === 'loading' ? <ButtonSpinner /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

type SortOption = 'title-asc' | 'title-desc' | 'year-desc' | 'year-asc' | 'rating-desc' | 'rating-asc' | 'user-rating-desc';

function MovieListWidget() {
  console.log('[MovieListWidget] mounted');
  
  const toolOutput = useToolOutput();
  const theme = useTheme();
  const displayMode = useDisplayMode();
  const [sortBy, setSortBy] = useState<SortOption>('rating-desc');

  console.log('[MovieListWidget] toolOutput:', toolOutput);
  console.log('[MovieListWidget] theme:', theme);
  console.log('[MovieListWidget] displayMode:', displayMode);

  const movies = useMemo<Movie[]>(() => {
    console.log('[MovieListWidget] extracting movies from toolOutput:', toolOutput);
    if (!toolOutput) {
      console.log('[MovieListWidget] No toolOutput!');
      return [];
    }
    const anyOut: any = toolOutput as any;
    
    console.log('[MovieListWidget] toolOutput keys:', Object.keys(anyOut));
    console.log('[MovieListWidget] toolOutput structure:', JSON.stringify(anyOut, null, 2));
    
    // Try direct movies array
    if (anyOut?.movies && Array.isArray(anyOut.movies)) {
      console.log('[MovieListWidget] Found movies in toolOutput.movies');
      return anyOut.movies as Movie[];
    }
    
    // Try structuredContent.movies
    if (anyOut?.structuredContent?.movies && Array.isArray(anyOut.structuredContent.movies)) {
      console.log('[MovieListWidget] Found movies in toolOutput.structuredContent.movies');
      return anyOut.structuredContent.movies as Movie[];
    }
    
    // Try result.structuredContent.movies (OpenAI MCP wrapper)
    if (anyOut?.result?.structuredContent?.movies && Array.isArray(anyOut.result.structuredContent.movies)) {
      console.log('[MovieListWidget] Found movies in toolOutput.result.structuredContent.movies');
      return anyOut.result.structuredContent.movies as Movie[];
    }
    
    // Try watchlist
    if (anyOut?.watchlist && Array.isArray(anyOut.watchlist)) {
      console.log('[MovieListWidget] Found movies in toolOutput.watchlist');
      return anyOut.watchlist as Movie[];
    }
    
    if (anyOut?.result?.structuredContent?.watchlist && Array.isArray(anyOut.result.structuredContent.watchlist)) {
      console.log('[MovieListWidget] Found movies in toolOutput.result.structuredContent.watchlist');
      return anyOut.result.structuredContent.watchlist as Movie[];
    }
    
    console.log('[MovieListWidget] No movies found in any expected path');
    return [];
  }, [toolOutput]);

  // Detect if we're viewing a watchlist (all movies are in watchlist)
  const isWatchlistView = useMemo(() => {
    if (movies.length === 0) return false;
    return movies.every((m: any) => m.inWatchlist === true);
  }, [movies]);

  // Sort movies based on selected option
  const sortedMovies = useMemo(() => {
    const sorted = [...movies];
    const anyMovies = sorted as any[];
    
    switch (sortBy) {
      case 'title-asc':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case 'year-asc':
        return sorted.sort((a, b) => (a.year || 0) - (b.year || 0));
      case 'year-desc':
        return sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
      case 'rating-desc':
        return anyMovies.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'rating-asc':
        return anyMovies.sort((a, b) => (a.rating || 0) - (b.rating || 0));
      case 'user-rating-desc':
        return anyMovies.sort((a, b) => (b.userRating || 0) - (a.userRating || 0));
      default:
        return sorted;
    }
  }, [movies, sortBy]);

  if (movies.length === 0) {
    return (
      <div className={`font-sans box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
        <LoadingSpinner message="Loading movies..." />
      </div>
    );
  }

  return (
    <div className={`font-sans p-3 box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
      {/* Sort dropdown */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
          {sortedMovies.length} {sortedMovies.length === 1 ? 'movie' : 'movies'}
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-xs text-gray-500 dark:text-gray-400">Sort by:</label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="year-desc">Year (Newest)</option>
            <option value="year-asc">Year (Oldest)</option>
            <option value="title-asc">Title (A-Z)</option>
            <option value="title-desc">Title (Z-A)</option>
            <option value="rating-desc">Rating (High)</option>
            <option value="rating-asc">Rating (Low)</option>
            <option value="user-rating-desc">Your Rating</option>
          </select>
        </div>
      </div>
      
      {/* Movie list */}
      <div className="flex flex-col gap-2.5 max-h-[500px] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-black/5 dark:[&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-track]:rounded [&::-webkit-scrollbar-thumb]:bg-black/20 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded">
        {sortedMovies.map((movie) => (
          <MovieListItem key={movie.tmdb_id} movie={movie} hideWatchlistButton={isWatchlistView} />
        ))}
      </div>
      
      {/* TMDB Attribution - Required by TMDB API Terms */}
      <div className="mt-3 text-center">
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

// Inject CSS into the document
function injectStyles() {
  // Check if styles are already injected
  if (document.getElementById('movie-list-widget-styles')) {
    return;
  }
  
  const styleElement = document.createElement('style');
  styleElement.id = 'movie-list-widget-styles';
  styleElement.textContent = cssContent;
  document.head.appendChild(styleElement);
}

// Bootstrap
function bootstrap() {
  // Inject CSS first
  injectStyles();
  
  const container = document.getElementById('movie-list-widget-root');
  if (!container) {
    console.error('MovieListWidget: root element not found');
    return;
  }

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <MovieListWidget />
    </StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

