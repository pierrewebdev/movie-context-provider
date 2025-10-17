/**
 * Multi-Provider LLM Integration
 * AI-powered movie recommendations using best-in-class models:
 * - Anthropic: Claude Sonnet 4.5 (best balance of speed and intelligence)
 * - OpenAI: GPT-5 (uses new Responses API)
 * - Google: Gemini 2.5 Flash (best price-performance)
 * 
 * Provider is automatically selected based on available API keys (priority: OpenAI > Anthropic > Gemini)
 * To switch providers, just set the appropriate API key environment variable
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// LLM Provider type
type LLMProvider = 'anthropic' | 'openai' | 'gemini';

// Fixed Model Configuration
// Each provider uses a single, best-in-class model
// To switch providers, just set the appropriate API key
const MODEL_CONFIG = {
  anthropic: 'claude-sonnet-4-5',  // Claude Sonnet 4.5: Best balance of speed and intelligence
  openai: 'gpt-5',                 // GPT-5: Latest OpenAI model
  gemini: 'gemini-2.5-flash',      // Gemini 2.5 Flash: Best price-performance
} as const;

// Lazy-initialized clients
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

/**
 * Detect which LLM provider to use based on available API keys
 * Priority: OpenAI > Anthropic > Gemini (OpenAI is most common)
 */
function detectProvider(): LLMProvider {
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  if (process.env.GEMINI_API_KEY) {
    return 'gemini';
  }
  throw new Error('No LLM API key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY');
}

/**
 * Get or initialize the appropriate LLM client
 */
function getClient(provider: LLMProvider) {
  switch (provider) {
    case 'anthropic':
      if (!anthropicClient) {
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      }
      return anthropicClient;
    case 'openai':
      if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      }
      return openaiClient;
    case 'gemini':
      if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      }
      return geminiClient;
  }
}

export interface WatchedMovie {
  title: string;
  year: number | null;
  rating: number;
  overview: string;
}

export interface UserPreferences {
  [key: string]: any;
}

export interface Recommendation {
  title: string;
  reason: string;
  tmdb_id?: number;
}

/**
 * Build prompts for LLM recommendations
 */
function buildPrompts(
  watchHistory: WatchedMovie[],
  preferences: UserPreferences,
  mood: string | undefined,
  limit: number,
  allWatchedTitles: string[] | undefined
) {
  const watchHistoryText = watchHistory.length > 0
    ? watchHistory
        .filter((m) => m.rating >= 4)
        .slice(0, 20)
        .map((m) => `- ${m.title} (${m.year}) - Rating: ${m.rating}/5 - ${m.overview}`)
        .join('\n')
    : 'No watch history available yet.';
  
  const watchedMoviesText = allWatchedTitles && allWatchedTitles.length > 0
    ? `\n**Movies Already Watched (DO NOT recommend these):**\n${allWatchedTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  const preferencesText = Object.keys(preferences).length > 0
    ? Object.entries(preferences)
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join('\n')
    : 'No preferences set yet.';

  const systemPrompt = `You are a movie recommendation expert. Your task is to recommend movies based on a user's watch history and preferences. 

IMPORTANT: You will be given a list of movies the user has ALREADY WATCHED. Do NOT recommend any of these movies. Only recommend movies they haven't seen yet.

Provide recommendations that are personalized, diverse, and include clear reasoning. Each recommendation should include:
1. The movie title and year
2. A brief but compelling reason why this movie matches the user's taste

Return your response as a JSON array with this exact structure:
[
  {
    "title": "Movie Title (Year)",
    "reason": "Why this movie is recommended"
  }
]

Recommend exactly ${limit} movies.`;

  const userPrompt = `Here is the user's profile:

**Highly-Rated Movies:**
${watchHistoryText}

**User Preferences:**
${preferencesText}
${watchedMoviesText}

${mood ? `**Current Mood:** ${mood}\n` : ''}

Based on this information, recommend ${limit} movies that this user would enjoy. ${allWatchedTitles && allWatchedTitles.length > 0 ? 'REMEMBER: Do NOT recommend any movies from the "Already Watched" list above. ' : ''}Consider their taste patterns, preferred genres, and ${mood ? 'their current mood' : 'variety across different styles'}.`;

  return { systemPrompt, userPrompt };
}

/**
 * Parse LLM response and extract recommendations
 */
function parseRecommendations(text: string, limit: number): Recommendation[] {
  let jsonText = text.trim();
  
  // Remove markdown code blocks if present
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/g, '');
  }

  const recommendations: Recommendation[] = JSON.parse(jsonText);

  if (!Array.isArray(recommendations)) {
    throw new Error('Invalid recommendations format from LLM');
  }

  return recommendations.slice(0, limit);
}

/**
 * Call Anthropic Claude Sonnet 4.5 for recommendations
 */
async function getRecommendationsFromAnthropic(
  systemPrompt: string,
  userPrompt: string,
  limit: number
): Promise<Recommendation[]> {
  const client = getClient('anthropic') as Anthropic;
  
  console.log('📡 Calling Claude Sonnet 4.5...');
  
  const message = await client.messages.create({
    model: MODEL_CONFIG.anthropic,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  return parseRecommendations(content.text, limit);
}

/**
 * Call OpenAI GPT-5 for recommendations
 * GPT-5 uses the new Responses API with responses.create() method
 * Example from OpenAI docs: https://platform.openai.com/docs/guides/latest-model
 */
async function getRecommendationsFromOpenAI(
  systemPrompt: string,
  userPrompt: string,
  limit: number
): Promise<Recommendation[]> {
  const client = getClient('openai') as OpenAI;
  
  console.log('📡 Calling GPT-5 Responses API...');
  
  // GPT-5 uses responses.create() instead of chat.completions.create()
  // Uses "input" instead of "messages"
  const result = await (client as any).responses.create({
    model: MODEL_CONFIG.openai,
    input: `${systemPrompt}\n\n${userPrompt}`,
    reasoning: { effort: 'medium' },
    text: { verbosity: 'medium' },
  });

  const content = result.output_text;
  if (!content) {
    console.error('GPT-5 returned no output. Full response:', JSON.stringify(result, null, 2));
    throw new Error('No response from GPT-5');
  }

  return parseRecommendations(content, limit);
}

/**
 * Call Google Gemini 2.5 Flash for recommendations
 */
async function getRecommendationsFromGemini(
  systemPrompt: string,
  userPrompt: string,
  limit: number
): Promise<Recommendation[]> {
  const client = getClient('gemini') as GoogleGenerativeAI;
  const model = client.getGenerativeModel({ model: MODEL_CONFIG.gemini });
  
  console.log('📡 Calling Gemini 2.5 Flash...');
  
  const result = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
    ],
  });

  const content = result.response.text();
  if (!content) {
    throw new Error('No response from Gemini');
  }

  return parseRecommendations(content, limit);
}

/**
 * Generate AI-powered movie recommendations based on user history and preferences
 * Automatically selects LLM provider based on available API keys
 * 
 * @param watchHistory - Array of movies the user has watched and rated
 * @param preferences - User's stored preferences (genres, actors, moods, etc.)
 * @param mood - Optional current mood to tailor recommendations
 * @param limit - Maximum number of recommendations (default: 5)
 * @param allWatchedTitles - List of all watched movies to exclude
 * @returns Array of movie recommendations with reasoning
 */
export async function getRecommendations(
  watchHistory: WatchedMovie[],
  preferences: UserPreferences,
  mood?: string,
  limit: number = 5,
  allWatchedTitles?: string[]
): Promise<Recommendation[]> {
  try {
    // Detect which provider to use
    const provider = detectProvider();
    console.log(`🤖 Using ${provider.toUpperCase()} for recommendations`);

    // Build prompts
    const { systemPrompt, userPrompt } = buildPrompts(
      watchHistory,
      preferences,
      mood,
      limit,
      allWatchedTitles
    );

    // Call the appropriate provider
    switch (provider) {
      case 'anthropic':
        return await getRecommendationsFromAnthropic(systemPrompt, userPrompt, limit);
      case 'openai':
        return await getRecommendationsFromOpenAI(systemPrompt, userPrompt, limit);
      case 'gemini':
        return await getRecommendationsFromGemini(systemPrompt, userPrompt, limit);
    }
  } catch (error) {
    console.error('Error generating recommendations:', error);
    throw new Error(`Failed to generate recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate LLM API configuration
 * Useful for startup checks
 */
export async function validateLLMConfig(): Promise<boolean> {
  try {
    const provider = detectProvider();
    console.log(`Validating ${provider.toUpperCase()} API configuration...`);
    return true;
  } catch (error) {
    console.error('No LLM API key configured:', error);
    return false;
  }
}

/**
 * Get the current LLM provider name (for logging/debugging)
 */
export function getCurrentProvider(): string {
  try {
    return detectProvider().toUpperCase();
  } catch {
    return 'NONE';
  }
}

