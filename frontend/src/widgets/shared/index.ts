/**
 * Shared Widgets Utilities
 * Central export point for all shared code
 */

// Hooks
export { useOpenAiGlobal } from './hooks.js';

// Components
export { ButtonSpinner, LoadingSpinner } from './components.js';

// Styles
export { buttons, buttonStyles, containers, text, badges } from './styles.js';

// OpenAI API
export {
  callTool,
  setWidgetState,
  getWidgetState,
  isOpenAiAvailable,
  addToWatchlist,
  removeFromWatchlist,
  markAsWatched,
  type ToolResponse,
  type WatchlistToolArgs,
  type WatchlistToolResponse,
  type MarkAsWatchedArgs,
  type MarkAsWatchedResponse,
} from './openai-api.js';




