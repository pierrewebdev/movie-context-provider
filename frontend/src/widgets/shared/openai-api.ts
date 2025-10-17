/**
 * Typed OpenAI API Wrapper
 * Provides type-safe access to window.openai methods
 * Easier to mock for tests and prevents accidental API misuse
 */

/**
 * Tool call response type
 */
export interface ToolResponse {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: any;
}

/**
 * Call an MCP tool with typed arguments
 * 
 * @param toolName - Name of the tool to call
 * @param args - Tool arguments (must be a valid JSON object)
 * @returns Promise resolving to tool response (extracted from structuredContent)
 * 
 * @example
 * ```tsx
 * const response = await callTool<WatchlistResponse>('add_to_watchlist', {
 *   tmdb_id: movie.tmdb_id,
 *   notes: 'Must watch!'
 * });
 * ```
 */
export async function callTool<T = ToolResponse>(
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  if (!window.openai?.callTool) {
    throw new Error('OpenAI API not available');
  }
  
  try {
    const response = await window.openai.callTool(toolName, args);
    // Extract structuredContent from MCP response
    const structured = (response as any).structuredContent as T;
    return structured || (response as T);
  } catch (error) {
    console.error(`[OpenAI API] Tool call failed: ${toolName}`, error);
    throw error;
  }
}

/**
 * Set widget state (persisted across renders)
 * 
 * @param state - State object to persist
 * 
 * @example
 * ```tsx
 * setWidgetState({ lastAddedId: movie.tmdb_id });
 * ```
 */
export function setWidgetState<T extends Record<string, any>>(state: T): void {
  if (!window.openai?.setWidgetState) {
    console.warn('[OpenAI API] setWidgetState not available');
    return;
  }
  
  window.openai.setWidgetState(state);
}

/**
 * Get current widget state
 * 
 * @returns Current widget state or empty object
 * 
 * @example
 * ```tsx
 * const state = getWidgetState<{ lastAddedId?: number }>();
 * ```
 */
export function getWidgetState<T extends Record<string, any>>(): T {
  if (!window.openai?.widgetState) {
    return {} as T;
  }
  
  return window.openai.widgetState as T;
}

/**
 * Check if OpenAI API is available
 * Useful for conditional rendering or error handling
 */
export function isOpenAiAvailable(): boolean {
  return typeof window !== 'undefined' && 
         typeof window.openai !== 'undefined' &&
         typeof window.openai.callTool === 'function';
}

/**
 * Tool-specific typed wrappers
 * Provides even stronger typing for commonly used tools
 */

export interface WatchlistToolArgs extends Record<string, unknown> {
  tmdb_id: number;
  notes?: string;
}

export interface WatchlistToolResponse {
  success: boolean;
  message: string;
}

export interface MarkAsWatchedArgs extends Record<string, unknown> {
  tmdb_id: number;
  rating: number;
  notes?: string;
}

export interface MarkAsWatchedResponse {
  success: boolean;
  message: string;
}

/**
 * Add movie to watchlist (typed wrapper)
 */
export function addToWatchlist(args: WatchlistToolArgs): Promise<WatchlistToolResponse> {
  return callTool<WatchlistToolResponse>('add_to_watchlist', args);
}

/**
 * Remove movie from watchlist (typed wrapper)
 */
export function removeFromWatchlist(tmdb_id: number): Promise<WatchlistToolResponse> {
  return callTool<WatchlistToolResponse>('remove_from_watchlist', { tmdb_id });
}

/**
 * Mark movie as watched (typed wrapper)
 */
export function markAsWatched(args: MarkAsWatchedArgs): Promise<MarkAsWatchedResponse> {
  return callTool<MarkAsWatchedResponse>('mark_as_watched', args);
}

