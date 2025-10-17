/**
 * Shared React Components
 * Reusable UI components for widgets
 */

/**
 * Small spinner for button loading states
 */
export function ButtonSpinner() {
  return (
    <div 
      className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"
      aria-label="Loading"
    />
  );
}

/**
 * Large spinner for content loading states
 */
export function LoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div 
        className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"
        aria-label="Loading"
      />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
    </div>
  );
}



