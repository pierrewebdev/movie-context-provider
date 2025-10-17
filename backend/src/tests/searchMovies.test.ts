import { describe, expect, it } from 'vitest';
import { buildImageUrl } from '../utils/tmdb.js';

describe('TMDB image URL helpers', () => {
  it('builds poster URLs correctly', () => {
    const url = buildImageUrl('/poster.jpg', 'poster');
    expect(url).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
  });

  it('builds backdrop URLs correctly', () => {
    const url = buildImageUrl('/backdrop.jpg', 'backdrop');
    expect(url).toBe('https://image.tmdb.org/t/p/w780/backdrop.jpg');
  });

  it('returns null when no path provided', () => {
    expect(buildImageUrl(null, 'poster')).toBeNull();
  });
});


