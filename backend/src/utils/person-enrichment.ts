/**
 * Person Enrichment Utilities
 * Helper functions for enriching person names with TMDB data (profile pictures, etc.)
 */

import { searchPeople } from './tmdb.js';

export interface EnrichedPerson {
  name: string;
  profile_url: string | null;
  id: number;
}

/**
 * Enrich an array of person names with TMDB data
 * Searches for each person and adds their profile picture URL
 * 
 * @param names - Array of person names to enrich
 * @returns Array of enriched person objects with name, profile_url, and id
 */
export async function enrichPersonNames(names: string[]): Promise<EnrichedPerson[]> {
  const enrichedPeople = await Promise.all(
    names.map(async (name) => {
      try {
        const people = await searchPeople(name);
        if (people.length > 0) {
          const person = people[0]; // Use most popular match
          return {
            name: name, // Keep original name from preferences
            profile_url: person.profile_url,
            id: person.id,
          };
        }
      } catch (error) {
        console.error(`Failed to enrich person: ${name}`, error);
      }
      
      // Fallback if search fails or no results
      return {
        name: name,
        profile_url: null,
        id: 0,
      };
    })
  );
  
  return enrichedPeople;
}

/**
 * Normalize person data to a consistent string format
 * Handles nested objects and extracts the person's name
 * 
 * @param item - Person data (string or object with name property)
 * @returns Normalized name string
 */
export function normalizePersonName(item: any): string {
  if (typeof item === 'string') {
    return item;
  } else if (typeof item === 'object' && item !== null && 'name' in item) {
    const nameValue = typeof item.name === 'object' && item.name !== null && 'name' in item.name
      ? item.name.name
      : item.name;
    return String(nameValue);
  }
  return String(item);
}

/**
 * Normalize an array of person data to string names
 * 
 * @param people - Array of person data (strings or objects)
 * @returns Array of normalized name strings
 */
export function normalizePersonNames(people: any[]): string[] {
  return people.map(normalizePersonName);
}


