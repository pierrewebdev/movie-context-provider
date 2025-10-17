/**
 * User Preferences Tools
 * Store and retrieve user preferences (genres, actors, moods, etc.)
 */

import { z } from 'zod';
import { query, transaction } from '../db/client.js';
import { enrichPersonNames, normalizePersonNames } from '../utils/person-enrichment.js';
import { OPENAI_WIDGET_META, WIDGET_CONFIG } from '../config/constants.js';
import { withToolHandler } from '../utils/tool-helpers.js';
import { getCached, setCached, deleteCached } from '../cache/redis.js';

const PREFERENCES_WIDGET_URL = process.env.MOVIE_POSTER_WIDGET_URL;


/**
 * Get all user preferences
 * Returns all stored preferences as a key-value object
 * Enriches actor/director preferences with TMDB profile pictures
 * Results are cached for 5 minutes to optimize repeated calls
 * 
 * @param userId - Authenticated user's ID
 * @returns Object with all preference key-value pairs
 */
export async function getPreferences(userId: number) {
  try {
    // Try to get from cache first
    const cacheKey = `user:${userId}:preferences`;
    const cached = await getCached<any>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] User preferences: ${userId}`);
      return cached;
    }

    console.log(`[Cache MISS] User preferences: ${userId}`);

    const result = await query(
      `SELECT key, value, updated_at
       FROM preferences
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );

    // Enrich preferences with TMDB data for actors/directors
    const enrichedPreferences = await Promise.all(
      result.rows.map(async (row) => {
        const key = row.key;
        let value = row.value;

        // Enrich actor and director preferences with profile pictures
        if ((key === 'favorite_actors' || key === 'favorite_directors') && Array.isArray(value)) {
          // Extract all names (from strings or objects) using helper
          const names = normalizePersonNames(value);
          
          // Always enrich with fresh TMDB data
          value = await enrichPersonNames(names);
        }

        return { key, value };
      })
    );

    const summaryLines: string[] = enrichedPreferences.map((pref) => {
      const valueStr = Array.isArray(pref.value) && pref.value.length > 0 && typeof pref.value[0] === 'object'
        ? pref.value.map((p: any) => p.name).join(', ')
        : JSON.stringify(pref.value);
      return `• ${pref.key}: ${valueStr}`;
    });

    const summaryMessage = enrichedPreferences.length > 0
      ? `Retrieved ${enrichedPreferences.length} preference(s).`
      : 'No preferences saved yet. Use set_preference to add some.';

    // Widget metadata
    const widgetMeta = PREFERENCES_WIDGET_URL && enrichedPreferences.length > 0
      ? {
          'openai/outputTemplate': 'ui://widget/preferences',
          ...OPENAI_WIDGET_META,
          'openai/toolInvocation/invoking': 'Loading preferences...',
          'openai/toolInvocation/invoked': 'Loaded preferences',
        }
      : undefined;

    const response = {
      content: [
        {
          type: 'text' as const,
          text: widgetMeta 
            ? summaryMessage
            : `${summaryMessage}${summaryLines.length ? `\n${summaryLines.join('\n')}` : ''}`,
        },
      ],
      structuredContent: {
        success: true,
        preferences: enrichedPreferences,
        count: enrichedPreferences.length,
        message: summaryMessage,
      },
      ...(widgetMeta && { _meta: widgetMeta }),
    };

    // Cache for 5 minutes (300 seconds)
    await setCached(cacheKey, response, 300);

    return response;
  } catch (error) {
    console.error('Error in getPreferences tool:', error);

    return {
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error
            ? `Failed to load preferences: ${error.message}`
            : 'Failed to load preferences due to an unknown error.',
        },
      ],
      structuredContent: {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      isError: true,
    };
  }
}

// Input schema for setting multiple preferences at once
export const SetPreferencesSchema = z.object({
  preferences: z.array(z.object({
    key: z.string().min(1, 'Preference key is required'),
    value: z.any(),
  })).min(1, 'At least one preference is required'),
});

export type SetPreferencesInput = z.infer<typeof SetPreferencesSchema>;

/**
 * Set multiple user preferences at once - Handler logic
 * Uses a proper database transaction to ensure atomicity
 */
async function handleSetPreferences(validatedInput: SetPreferencesInput, userId?: number) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Use a proper transaction to set all preferences atomically
  await transaction(async (client) => {
    // Process each preference sequentially within the transaction
    // This prevents race conditions and ensures all-or-nothing semantics
    for (const pref of validatedInput.preferences) {
      let normalizedValue = pref.value;
      
      // For array preferences (actors/directors/genres), append instead of replace
      const isArrayPreference = ['favorite_actors', 'favorite_directors', 'favorite_genres'].includes(pref.key);
      
      if (isArrayPreference && Array.isArray(pref.value)) {
        // Get existing value using the transaction client
        const existingResult = await client.query(
          'SELECT value FROM preferences WHERE user_id = $1 AND key = $2',
          [userId, pref.key]
        );
        
        const existingValue = existingResult.rows.length > 0 ? existingResult.rows[0].value : [];
        const existingArray = Array.isArray(existingValue) ? existingValue : [];
        
        // Normalize and deduplicate
        if (pref.key === 'favorite_actors' || pref.key === 'favorite_directors') {
          // For people preferences, normalize everything to strings for consistency
          // They will be enriched with profile pics on retrieval
          // Normalize existing and new names using helper
          const existingNames = normalizePersonNames(existingArray);
          const newNames = normalizePersonNames(pref.value);
          
          // Merge: keep existing names + add new ones that don't exist
          // Store as strings - they'll be enriched on get_preferences
          const merged = [...existingNames];
          for (const newName of newNames) {
            if (!existingNames.includes(newName)) {
              merged.push(newName);
            }
          }
          normalizedValue = merged;
        } else {
          // For simple arrays (genres), just dedupe
          const existingSet = new Set(existingArray.map((item: any) => String(item)));
          const newValues = pref.value.filter((item: any) => !existingSet.has(String(item)));
          normalizedValue = [...existingArray, ...newValues];
        }
      }
      
      const jsonValue = JSON.stringify(normalizedValue);
      // Use transaction client for the insert/update
      await client.query(
        `INSERT INTO preferences (user_id, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, key)
         DO UPDATE SET value = $3::jsonb, updated_at = NOW()`,
        [userId, pref.key, jsonValue]
      );
    }
  });

  // Invalidate the preferences cache after modifying preferences
  const cacheKey = `user:${userId}:preferences`;
  await deleteCached(cacheKey);
  console.log(`[Cache INVALIDATE] User preferences: ${userId}`);

  const count = validatedInput.preferences.length;
  const successMessage = `Successfully set ${count} preference${count !== 1 ? 's' : ''}`;

  // Get all preferences to display in widget (will rebuild cache)
  const preferencesResult = await getPreferences(userId);

  return {
    message: successMessage,
    structuredContent: preferencesResult.structuredContent,
    _meta: PREFERENCES_WIDGET_URL ? {
      ...OPENAI_WIDGET_META,
      'openai/outputTemplate': WIDGET_CONFIG.preferences.uri,
      'openai/widgetUrl': `${PREFERENCES_WIDGET_URL}/${WIDGET_CONFIG.preferences.componentFilename}`,
    } : undefined,
  };
}

/**
 * Set multiple user preferences at once
 * Stores multiple key-value pairs in a single transaction
 * 
 * @param input - Array of preference key-value pairs
 * @param userId - Authenticated user's ID
 * @returns Success status with count of preferences set
 */
export const setPreferences = withToolHandler({
  schema: SetPreferencesSchema,
  toolName: 'set_preferences',
  handler: handleSetPreferences,
  toTextContent: (result) => result.message,
  toStructuredContent: (result) => result.structuredContent,
  toMeta: (result) => result._meta,
  errorMessagePrefix: 'Failed to save preferences',
});

// Input schema for removing items from array preferences
export const RemovePreferenceItemSchema = z.object({
  key: z.string().min(1, 'Preference key is required'),
  item: z.union([z.string(), z.number()]).describe('Item to remove from the array (by value for simple arrays, or by name for person arrays)'),
});

export type RemovePreferenceItemInput = z.infer<typeof RemovePreferenceItemSchema>;

/**
 * Remove an item from an array preference - Handler logic
 * Uses a proper database transaction to ensure atomicity
 */
async function handleRemovePreferenceItem(validatedInput: RemovePreferenceItemInput, userId?: number) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Use a proper transaction for atomic read-modify-write
  const successMessage = await transaction(async (client) => {
    // Get current preference using the transaction client
    const result = await client.query(
      `SELECT value FROM preferences WHERE user_id = $1 AND key = $2`,
      [userId, validatedInput.key]
    );

    if (result.rows.length === 0) {
      throw new Error(`Preference "${validatedInput.key}" not found`);
    }

    const currentValue = result.rows[0].value;

    // Ensure it's an array
    if (!Array.isArray(currentValue)) {
      throw new Error(`Preference "${validatedInput.key}" is not an array`);
    }

    // Remove the item
    let updatedValue: any[];
    if (typeof currentValue[0] === 'object' && currentValue[0] !== null && 'name' in currentValue[0]) {
      // Object array (actors/directors) - remove by name
      updatedValue = currentValue.filter((item: any) => item.name !== validatedInput.item);
    } else {
      // Simple array (genres) - remove by value
      updatedValue = currentValue.filter((item: any) => item !== validatedInput.item);
    }

    // If array is now empty, delete the preference
    if (updatedValue.length === 0) {
      await client.query(
        `DELETE FROM preferences WHERE user_id = $1 AND key = $2`,
        [userId, validatedInput.key]
      );
      return `Removed "${validatedInput.item}" from ${validatedInput.key}. Preference deleted because it's now empty.`;
    } else {
      // Update with new array
      const jsonValue = JSON.stringify(updatedValue);
      await client.query(
        `UPDATE preferences SET value = $1::jsonb, updated_at = NOW() WHERE user_id = $2 AND key = $3`,
        [jsonValue, userId, validatedInput.key]
      );
      return `Removed "${validatedInput.item}" from ${validatedInput.key}`;
    }
  });

  // Invalidate the preferences cache after modifying preferences
  const cacheKey = `user:${userId}:preferences`;
  await deleteCached(cacheKey);
  console.log(`[Cache INVALIDATE] User preferences: ${userId}`);

  // Get all preferences to display in widget (will rebuild cache)
  const preferencesResult = await getPreferences(userId);

  return {
    message: successMessage,
    structuredContent: preferencesResult.structuredContent,
    _meta: PREFERENCES_WIDGET_URL ? {
      ...OPENAI_WIDGET_META,
      'openai/outputTemplate': WIDGET_CONFIG.preferences.uri,
      'openai/widgetUrl': `${PREFERENCES_WIDGET_URL}/${WIDGET_CONFIG.preferences.componentFilename}`,
    } : undefined,
  };
}

/**
 * Remove an item from an array preference
 * Works with simple arrays (genres) and object arrays (actors/directors)
 * 
 * @param input - Preference key and item to remove
 * @param userId - Authenticated user's ID
 * @returns Success status with updated preferences
 */
export const removePreferenceItem = withToolHandler({
  schema: RemovePreferenceItemSchema,
  toolName: 'remove_preference_item',
  handler: handleRemovePreferenceItem,
  toTextContent: (result) => result.message,
  toStructuredContent: (result) => result.structuredContent,
  toMeta: (result) => result._meta,
  errorMessagePrefix: 'Failed to remove item',
});

// Tool metadata for MCP registration
export const setPreferencesToolDefinition = {
  name: 'set_preferences',
  description: 'Store or update user preferences. Can set one or multiple preferences at once. All preferences are saved atomically. Common keys: favorite_genres, favorite_actors, favorite_directors.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      preferences: {
        type: 'array' as const,
        description: 'Array of preference objects, each with a key and value',
        items: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string' as const,
              description: 'Preference key',
            },
            value: {
              description: 'Preference value (can be any JSON-serializable type)',
            },
          },
          required: ['key', 'value'],
        },
      },
    },
    required: ['preferences'],
  } as const,
  // Add widget metadata to tool definition
  ...(PREFERENCES_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': WIDGET_CONFIG.preferences.uri,
      'openai/invokingMessage': 'Setting preferences...',
      'openai/invokedMessage': 'Preferences updated',
    },
  }),
};

export const getPreferencesToolDefinition = {
  name: 'get_preferences',
  description: 'Retrieve all stored user preferences as a key-value object. Displays enriched preferences with profile pictures for actors and directors.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  // Add widget metadata to tool definition
  ...(PREFERENCES_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': 'ui://widget/preferences',
      ...OPENAI_WIDGET_META,
      'openai/toolInvocation/invoking': 'Loading preferences...',
      'openai/toolInvocation/invoked': 'Loaded preferences',
    },
  }),
};

export const removePreferenceItemToolDefinition = {
  name: 'remove_preference_item',
  description: 'Remove a single item from an array preference (e.g., remove one genre from favorite_genres, or one actor from favorite_actors). The preference key is automatically deleted if the array becomes empty.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      key: {
        type: 'string' as const,
        description: 'Preference key (e.g., "favorite_genres", "favorite_actors", "favorite_directors")',
      },
      item: {
        type: 'string' as const,
        description: 'Item to remove from the array. For person arrays (actors/directors), use the name. For simple arrays (genres), use the value.',
      },
    },
    required: ['key', 'item'],
  } as const,
  // Add widget metadata to tool definition
  ...(PREFERENCES_WIDGET_URL && {
    _meta: {
      'openai/outputTemplate': WIDGET_CONFIG.preferences.uri,
      'openai/invokingMessage': 'Removing preference item...',
      'openai/invokedMessage': 'Preference item removed',
    },
  }),
};

