/**
 * Shared Style Tokens
 * Centralized Tailwind class combinations for consistent styling
 */

/**
 * Button style variants
 * Extracts common button patterns to avoid mixing styling with business logic
 */
export const buttonStyles = {
  // Base button styles (shared by all variants)
  base: 'px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
  
  // Icon button base (smaller, square)
  iconBase: 'w-8 h-8 rounded-lg text-sm font-medium transition-all shadow-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed',
  
  // Variants
  primary: 'bg-blue-600 text-white hover:enabled:bg-blue-700 hover:enabled:shadow-md active:enabled:scale-95',
  
  success: 'bg-green-600 text-white hover:enabled:bg-green-700 hover:enabled:shadow-md active:enabled:scale-95',
  
  danger: 'bg-red-600 text-white hover:enabled:bg-red-700 hover:enabled:shadow-md active:enabled:scale-95',
  
  warning: 'bg-orange-600 text-white hover:enabled:bg-orange-700 hover:enabled:shadow-md active:enabled:scale-95',
  
  secondary: 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 hover:enabled:bg-gray-300 dark:hover:enabled:bg-gray-600 hover:enabled:shadow-md active:enabled:scale-95',
  
  ghost: 'bg-transparent text-gray-700 dark:text-gray-300 hover:enabled:bg-gray-100 dark:hover:enabled:bg-gray-800 active:enabled:scale-95',
} as const;

/**
 * Combined button class helpers
 */
export const buttons = {
  primary: `${buttonStyles.base} ${buttonStyles.primary}`,
  success: `${buttonStyles.base} ${buttonStyles.success}`,
  danger: `${buttonStyles.base} ${buttonStyles.danger}`,
  warning: `${buttonStyles.base} ${buttonStyles.warning}`,
  secondary: `${buttonStyles.base} ${buttonStyles.secondary}`,
  ghost: `${buttonStyles.base} ${buttonStyles.ghost}`,
  
  // Icon button variants
  iconPrimary: `${buttonStyles.iconBase} ${buttonStyles.primary}`,
  iconSuccess: `${buttonStyles.iconBase} ${buttonStyles.success}`,
  iconDanger: `${buttonStyles.iconBase} ${buttonStyles.danger}`,
  iconWarning: `${buttonStyles.iconBase} ${buttonStyles.warning}`,
  iconSecondary: `${buttonStyles.iconBase} ${buttonStyles.secondary}`,
  iconGhost: `${buttonStyles.iconBase} ${buttonStyles.ghost}`,
} as const;

/**
 * Card/container styles
 */
export const containers = {
  card: 'bg-white dark:bg-gray-800 rounded-lg shadow-md p-4',
  cardHover: 'bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow',
  panel: 'bg-gray-50 dark:bg-gray-900 rounded-lg p-3',
} as const;

/**
 * Text styles
 */
export const text = {
  heading: 'text-lg font-semibold text-gray-900 dark:text-gray-100',
  subheading: 'text-sm font-medium text-gray-700 dark:text-gray-300',
  body: 'text-sm text-gray-600 dark:text-gray-400',
  muted: 'text-xs text-gray-500 dark:text-gray-500',
  error: 'text-sm text-red-600 dark:text-red-400',
  success: 'text-sm text-green-600 dark:text-green-400',
} as const;

/**
 * Badge/tag styles
 */
export const badges = {
  default: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  success: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  warning: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  error: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
} as const;




