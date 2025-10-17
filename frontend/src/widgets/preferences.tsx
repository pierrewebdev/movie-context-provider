import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cssContent from '../styles.css?inline';
import { useOpenAiGlobal, LoadingSpinner, ButtonSpinner, callTool } from './shared/index.js';

// Types
type Preference = {
  key: string;
  value: any;
};

type ToolOutput = {
  success: boolean;
  preferences?: Preference[];
  message?: string;
} | null;

// Hooks
function useToolOutput(): ToolOutput {
  return useOpenAiGlobal('toolOutput');
}

function useTheme() {
  return useOpenAiGlobal('theme');
}

// Helper to format preference keys
function formatKey(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper to determine preference type and format value
function formatValue(value: any): { type: 'list' | 'text' | 'badge'; formatted: any } {
  if (Array.isArray(value)) {
    return { type: 'list', formatted: value };
  } else if (typeof value === 'string' || typeof value === 'number') {
    return { type: 'text', formatted: String(value) };
  } else if (typeof value === 'object' && value !== null) {
    return { type: 'text', formatted: JSON.stringify(value) };
  }
  return { type: 'text', formatted: String(value) };
}

// Genre styling configuration (case-insensitive lookup)
const genreStyles: Record<string, { emoji: string; lightBg: string; darkBg: string; lightText: string; darkText: string; lightBorder: string; darkBorder: string }> = {
  'action': { emoji: '💥', lightBg: 'bg-red-100', darkBg: 'bg-red-500/20', lightText: 'text-red-800', darkText: 'text-red-300', lightBorder: 'border-red-200', darkBorder: 'border-red-500/30' },
  'adventure': { emoji: '🗺️', lightBg: 'bg-orange-100', darkBg: 'bg-orange-500/20', lightText: 'text-orange-800', darkText: 'text-orange-300', lightBorder: 'border-orange-200', darkBorder: 'border-orange-500/30' },
  'animation': { emoji: '🎨', lightBg: 'bg-pink-100', darkBg: 'bg-pink-500/20', lightText: 'text-pink-800', darkText: 'text-pink-300', lightBorder: 'border-pink-200', darkBorder: 'border-pink-500/30' },
  'comedy': { emoji: '😂', lightBg: 'bg-yellow-100', darkBg: 'bg-yellow-500/20', lightText: 'text-yellow-800', darkText: 'text-yellow-300', lightBorder: 'border-yellow-200', darkBorder: 'border-yellow-500/30' },
  'crime': { emoji: '🔫', lightBg: 'bg-gray-100', darkBg: 'bg-gray-500/20', lightText: 'text-gray-800', darkText: 'text-gray-300', lightBorder: 'border-gray-200', darkBorder: 'border-gray-500/30' },
  'documentary': { emoji: '🎬', lightBg: 'bg-slate-100', darkBg: 'bg-slate-500/20', lightText: 'text-slate-800', darkText: 'text-slate-300', lightBorder: 'border-slate-200', darkBorder: 'border-slate-500/30' },
  'drama': { emoji: '🎭', lightBg: 'bg-purple-100', darkBg: 'bg-purple-500/20', lightText: 'text-purple-800', darkText: 'text-purple-300', lightBorder: 'border-purple-200', darkBorder: 'border-purple-500/30' },
  'family': { emoji: '👨‍👩‍👧‍👦', lightBg: 'bg-green-100', darkBg: 'bg-green-500/20', lightText: 'text-green-800', darkText: 'text-green-300', lightBorder: 'border-green-200', darkBorder: 'border-green-500/30' },
  'fantasy': { emoji: '🧙‍♂️', lightBg: 'bg-violet-100', darkBg: 'bg-violet-500/20', lightText: 'text-violet-800', darkText: 'text-violet-300', lightBorder: 'border-violet-200', darkBorder: 'border-violet-500/30' },
  'history': { emoji: '📜', lightBg: 'bg-amber-100', darkBg: 'bg-amber-500/20', lightText: 'text-amber-800', darkText: 'text-amber-300', lightBorder: 'border-amber-200', darkBorder: 'border-amber-500/30' },
  'horror': { emoji: '👻', lightBg: 'bg-red-100', darkBg: 'bg-red-500/20', lightText: 'text-red-900', darkText: 'text-red-200', lightBorder: 'border-red-300', darkBorder: 'border-red-500/30' },
  'music': { emoji: '🎵', lightBg: 'bg-fuchsia-100', darkBg: 'bg-fuchsia-500/20', lightText: 'text-fuchsia-800', darkText: 'text-fuchsia-300', lightBorder: 'border-fuchsia-200', darkBorder: 'border-fuchsia-500/30' },
  'mystery': { emoji: '🔍', lightBg: 'bg-indigo-100', darkBg: 'bg-indigo-500/20', lightText: 'text-indigo-800', darkText: 'text-indigo-300', lightBorder: 'border-indigo-200', darkBorder: 'border-indigo-500/30' },
  'romance': { emoji: '💕', lightBg: 'bg-rose-100', darkBg: 'bg-rose-500/20', lightText: 'text-rose-800', darkText: 'text-rose-300', lightBorder: 'border-rose-200', darkBorder: 'border-rose-500/30' },
  'science fiction': { emoji: '🚀', lightBg: 'bg-cyan-100', darkBg: 'bg-cyan-500/20', lightText: 'text-cyan-800', darkText: 'text-cyan-300', lightBorder: 'border-cyan-200', darkBorder: 'border-cyan-500/30' },
  'sci-fi': { emoji: '🚀', lightBg: 'bg-cyan-100', darkBg: 'bg-cyan-500/20', lightText: 'text-cyan-800', darkText: 'text-cyan-300', lightBorder: 'border-cyan-200', darkBorder: 'border-cyan-500/30' },
  'thriller': { emoji: '😱', lightBg: 'bg-red-100', darkBg: 'bg-red-500/20', lightText: 'text-red-800', darkText: 'text-red-300', lightBorder: 'border-red-200', darkBorder: 'border-red-500/30' },
  'war': { emoji: '⚔️', lightBg: 'bg-stone-100', darkBg: 'bg-stone-500/20', lightText: 'text-stone-800', darkText: 'text-stone-300', lightBorder: 'border-stone-200', darkBorder: 'border-stone-500/30' },
  'western': { emoji: '🤠', lightBg: 'bg-orange-100', darkBg: 'bg-orange-500/20', lightText: 'text-orange-900', darkText: 'text-orange-200', lightBorder: 'border-orange-300', darkBorder: 'border-orange-500/30' },
};

function getGenreStyle(genre: string) {
  // Normalize to lowercase for case-insensitive lookup
  const normalizedGenre = genre.toLowerCase().trim();
  return genreStyles[normalizedGenre] || { 
    emoji: '🎬', 
    lightBg: 'bg-blue-100', 
    darkBg: 'bg-blue-500/20', 
    lightText: 'text-blue-800', 
    darkText: 'text-blue-300', 
    lightBorder: 'border-blue-200', 
    darkBorder: 'border-blue-500/30' 
  };
}

// Badge component for list items
function Badge({ 
  children, 
  theme, 
  onRemove,
  genre,
  isRemoving
}: { 
  children: React.ReactNode; 
  theme: string;
  onRemove?: () => void;
  genre?: string;
  isRemoving?: boolean;
}) {
  const style = genre ? getGenreStyle(genre) : null;
  
  return (
    <span
      className={`inline-flex items-center rounded-full text-xs font-medium border overflow-hidden ${
        isRemoving ? 'opacity-50' : ''
      } ${
        style
          ? theme === 'dark'
            ? `${style.darkBg} ${style.darkText} ${style.darkBorder}`
            : `${style.lightBg} ${style.lightText} ${style.lightBorder}`
          : theme === 'dark'
          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
          : 'bg-blue-100 text-blue-800 border-blue-200'
      }`}
    >
      <span className="px-2.5 py-1 flex items-center gap-1">
        {style && <span>{style.emoji}</span>}
        {children}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className={`px-2 py-1 border-l transition-all text-sm font-bold ${
            isRemoving ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            style
              ? theme === 'dark' 
                ? `${style.darkBorder} hover:bg-black/20 ${style.darkText}` 
                : `${style.lightBorder} hover:bg-black/10 ${style.lightText}`
              : theme === 'dark' 
              ? 'border-blue-500/30 hover:bg-black/20 text-blue-300' 
              : 'border-blue-200 hover:bg-black/10 text-blue-600'
          }`}
          aria-label="Remove"
        >
          {isRemoving ? <ButtonSpinner /> : '×'}
        </button>
      )}
    </span>
  );
}

// Avatar card for people (actors/directors) with profile pictures
function PersonCard({ 
  person, 
  theme,
  onRemove,
  isRemoving
}: { 
  person: { name: string; profile_url: string | null }; 
  theme: string;
  onRemove?: () => void;
  isRemoving?: boolean;
}) {
  return (
    <div
      className={`flex items-center rounded-lg text-xs overflow-hidden ${
        isRemoving ? 'opacity-50' : ''
      } ${
        theme === 'dark'
          ? 'bg-gray-700/50 border border-gray-600'
          : 'bg-gray-100 border border-gray-200'
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 flex-1">
        {person.profile_url ? (
          <img
            src={person.profile_url}
            alt={person.name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
              theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          >
            👤
          </div>
        )}
        <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
          {person.name}
        </span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className={`px-3 py-1.5 border-l transition-all text-sm font-bold self-stretch ${
            isRemoving ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            theme === 'dark' 
              ? 'border-gray-600 hover:bg-black/20 text-gray-400 hover:text-gray-200' 
              : 'border-gray-200 hover:bg-black/10 text-gray-500 hover:text-gray-700'
          }`}
          aria-label="Remove"
        >
          {isRemoving ? <ButtonSpinner /> : '×'}
        </button>
      )}
    </div>
  );
}

// Preference item component
function PreferenceItem({ prefKey, value, theme }: { 
  prefKey: string; 
  value: any; 
  theme: string;
}) {
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const { type, formatted } = formatValue(value);

  // Check if this is a person preference (actors/directors) with profile pictures
  const isPersonList = (prefKey === 'favorite_actors' || prefKey === 'favorite_directors') &&
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    'name' in value[0];

  const handleRemove = async (item: string) => {
    // Optimistically hide the item - widget will reload with fresh data
    setRemovedItems(prev => new Set(prev).add(item));
    
    try {
      await callTool('remove_preference_item', {
        key: prefKey,
        item: item,
      });
      // Widget will reload automatically after tool call completes with updated data
    } catch (error) {
      console.error('Failed to remove preference item:', error);
      // Revert on error
      setRemovedItems(prev => {
        const next = new Set(prev);
        next.delete(item);
        return next;
      });
    }
  };

  return (
    <div
      className={`p-3 rounded-lg ${
        theme === 'dark' ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'
      }`}
    >
      <h3
        className={`text-sm font-semibold mb-2 ${
          theme === 'dark' ? 'text-gray-200' : 'text-gray-800'
        }`}
      >
        {formatKey(prefKey)}
      </h3>

      {isPersonList ? (
        <div className="grid grid-cols-2 gap-2">
          {value.map((person: any, idx: number) => {
            const isRemoved = removedItems.has(person.name);
            if (isRemoved) {
              // Show "Removing..." state
              return (
                <div key={idx} className={`flex items-center rounded-lg text-xs overflow-hidden opacity-50 ${
                  theme === 'dark' ? 'bg-gray-700/50 border border-gray-600' : 'bg-gray-100 border border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 px-2 py-1.5 flex-1">
                    {person.profile_url ? (
                      <img src={person.profile_url} alt={person.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${
                        theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                      }`}>👤</div>
                    )}
                    <span className={`font-medium ${theme === 'dark' ? 'text-gray-400 line-through' : 'text-gray-500 line-through'}`}>
                      {person.name}
                    </span>
                  </div>
                  <div className={`px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                    Removed
                  </div>
                </div>
              );
            }
            return (
              <PersonCard 
                key={idx} 
                person={person} 
                theme={theme}
                onRemove={() => handleRemove(person.name)}
                isRemoving={false}
              />
            );
          })}
        </div>
      ) : type === 'list' ? (
        <div className="flex flex-wrap gap-1.5">
          {(formatted as any[]).map((item, idx) => {
            // Handle objects in lists (like person objects)
            let displayText: string;
            let removeKey: string;
            
            if (typeof item === 'object' && item !== null) {
              // Handle nested name objects: { name: { name: "Tom Cruise" } }
              if ('name' in item) {
                const nameValue = item.name;
                if (typeof nameValue === 'object' && nameValue !== null && 'name' in nameValue) {
                  // Deeply nested: extract the inner name
                  displayText = String(nameValue.name);
                  removeKey = String(nameValue.name);
                } else {
                  // Simple name property
                  displayText = String(nameValue);
                  removeKey = String(nameValue);
                }
              } else {
                // No name property, stringify the whole object
                displayText = JSON.stringify(item);
                removeKey = JSON.stringify(item);
              }
            } else {
              displayText = String(item);
              removeKey = String(item);
            }
            
            const isRemoved = removedItems.has(removeKey);
            
            if (isRemoved) {
              // Show "Removing..." state for badges
              const genre = prefKey === 'favorite_genres' ? displayText : undefined;
              const style = genre ? getGenreStyle(genre) : null;
              
              return (
                <span
                  key={idx}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border opacity-50 ${
                    style
                      ? theme === 'dark'
                        ? `${style.darkBg} ${style.darkText} ${style.darkBorder}`
                        : `${style.lightBg} ${style.lightText} ${style.lightBorder}`
                      : theme === 'dark'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : 'bg-blue-100 text-blue-800 border-blue-200'
                  }`}
                >
                  {style && <span>{style.emoji}</span>}
                  <span className="line-through mx-1">{displayText}</span>
                  <span className={`text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Removed</span>
                </span>
              );
            }
            
            return (
              <Badge 
                key={idx} 
                theme={theme}
                onRemove={() => handleRemove(removeKey)}
                genre={prefKey === 'favorite_genres' ? displayText : undefined}
                isRemoving={false}
              >
                {displayText}
              </Badge>
            );
          })}
        </div>
      ) : (
        <p
          className={`text-sm ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}
        >
          {typeof formatted === 'object' ? JSON.stringify(formatted) : String(formatted)}
        </p>
      )}
    </div>
  );
}

function PreferencesWidget() {
  console.log('[PreferencesWidget] mounted');

  const toolOutput = useToolOutput();
  const theme = useTheme() || 'light';

  console.log('[PreferencesWidget] toolOutput:', toolOutput);
  console.log('[PreferencesWidget] theme:', theme);

  // Loading state
  if (!toolOutput) {
    return (
      <div className={`font-sans p-6 box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
        <LoadingSpinner message="Loading preferences..." />
      </div>
    );
  }

  // Error state
  if (!toolOutput.success) {
    return (
      <div className={`font-sans p-6 box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
        <div className="flex items-center gap-2 text-red-500">
          <span className="text-2xl">⚠️</span>
          <span className="text-sm">{toolOutput.message || 'Failed to load preferences'}</span>
        </div>
      </div>
    );
  }

  const preferences = toolOutput.preferences || [];

  // Empty state
  if (preferences.length === 0) {
    return (
      <div
        className={`font-sans p-6 box-border text-center ${
          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl opacity-50">🎬</span>
          <p className="text-sm">
            No preferences set yet.
            <br />
            Try saying: "Set my favorite genres to action, sci-fi, thriller"
          </p>
        </div>
      </div>
    );
  }

  // Group preferences by category
  const categorized = {
    favorites: preferences.filter(p => p.key.startsWith('favorite_')),
    other: preferences.filter(p => !p.key.startsWith('favorite_')),
  };

  return (
    <div className={`font-sans p-4 box-border ${theme === 'dark' ? 'text-gray-50' : 'text-gray-900'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-2xl">⚙️</span>
        <div className="flex-1">
          <h2 className="text-lg font-bold m-0">Your Preferences</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 m-0">
            {preferences.length} preference{preferences.length !== 1 ? 's' : ''} saved
          </p>
        </div>
      </div>

      {/* Favorites Section */}
      {categorized.favorites.length > 0 && (
        <div className="mb-4">
          <h3
            className={`text-sm font-semibold mb-2 uppercase tracking-wide ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            Favorites
          </h3>
          <div className="flex flex-col gap-2">
            {categorized.favorites.map((pref) => (
              <PreferenceItem key={pref.key} prefKey={pref.key} value={pref.value} theme={theme} />
            ))}
          </div>
        </div>
      )}

      {/* Other Preferences */}
      {categorized.other.length > 0 && (
        <div>
          <h3
            className={`text-sm font-semibold mb-2 uppercase tracking-wide ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            Other
          </h3>
          <div className="flex flex-col gap-2">
            {categorized.other.map((pref) => (
              <PreferenceItem key={pref.key} prefKey={pref.key} value={pref.value} theme={theme} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mount the widget
const rootElement = document.getElementById('preferences-widget-root');
if (rootElement) {
  // Inject styles
  const styleTag = document.createElement('style');
  styleTag.textContent = cssContent;
  document.head.appendChild(styleTag);

  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <PreferencesWidget />
    </StrictMode>
  );

  console.log('[PreferencesWidget] Mounted to #preferences-widget-root');
} else {
  console.error('[PreferencesWidget] Root element #preferences-widget-root not found');
}

