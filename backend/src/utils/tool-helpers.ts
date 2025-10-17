/**
 * Tool Helpers
 * Standardized patterns for MCP tool implementations
 */

import { z } from 'zod';

/**
 * MCP Tool Response
 * Standard response format for all tools
 */
export interface MCPToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  structuredContent?: any;
  isError: boolean;
  _meta?: any;
}

/**
 * Tool Handler Options
 */
export interface ToolHandlerOptions<TInput, TResult> {
  /** Zod schema for input validation */
  schema: z.ZodSchema<TInput>;
  
  /** Name of the tool (for logging) */
  toolName: string;
  
  /** Handler function that executes the tool logic */
  handler: (validatedInput: TInput, userId?: number) => Promise<TResult>;
  
  /** Convert result to text for content array */
  toTextContent: (result: TResult) => string;
  
  /** Convert result to structured content (optional, defaults to result itself) */
  toStructuredContent?: (result: TResult) => any;
  
  /** Extract _meta from result (optional) */
  toMeta?: (result: TResult) => any;
  
  /** Custom error message prefix (optional, defaults to "Failed to execute {toolName}") */
  errorMessagePrefix?: string;
}

/**
 * Standardized tool handler wrapper
 * Handles:
 * - Input validation with Zod
 * - Error handling (Zod errors vs general errors)
 * - MCP response formatting
 * - Error logging
 * 
 * @example
 * ```ts
 * export async function addToWatchlist(input: unknown, userId: number) {
 *   return withToolHandler({
 *     schema: AddToWatchlistSchema,
 *     toolName: 'add_to_watchlist',
 *     handler: async (validatedInput) => {
 *       // Your logic here
 *       return { success: true, message: 'Added to watchlist' };
 *     },
 *     toTextContent: (result) => result.message,
 *   })(input, userId);
 * }
 * ```
 */
export function withToolHandler<TInput, TResult>(
  options: ToolHandlerOptions<TInput, TResult>
) {
  const {
    schema,
    toolName,
    handler,
    toTextContent,
    toStructuredContent,
    toMeta,
    errorMessagePrefix,
  } = options;

  return async (input: unknown, userId?: number): Promise<MCPToolResponse> => {
    try {
      // Validate input with Zod
      const validatedInput = schema.parse(input);

      // Execute handler logic
      const result = await handler(validatedInput, userId);

      // Build MCP-compliant response
      const response: MCPToolResponse = {
        content: [
          {
            type: 'text' as const,
            text: toTextContent(result),
          },
        ],
        structuredContent: toStructuredContent ? toStructuredContent(result) : result,
        isError: false,
      };

      // Add _meta if provided
      if (toMeta) {
        const meta = toMeta(result);
        if (meta) {
          response._meta = meta;
        }
      }

      return response;
    } catch (error) {
      console.error(`Error in ${toolName} tool:`, error);

      // Determine error message
      let errorMessage: string;
      let errorDetails: any;

      if (error instanceof z.ZodError) {
        errorMessage = 'Invalid input';
        errorDetails = error.errors;
      } else if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = undefined;
      } else {
        errorMessage = 'Unknown error occurred';
        errorDetails = undefined;
      }

      // Build error response
      const prefix = errorMessagePrefix || `Failed to execute ${toolName}`;
      
      return {
        content: [
          {
            type: 'text' as const,
            text: `${prefix}: ${errorMessage}`,
          },
        ],
        structuredContent: {
          success: false,
          error: errorMessage,
          ...(errorDetails && { details: errorDetails }),
        },
        isError: true,
      };
    }
  };
}

/**
 * Simple tool handler for tools that don't need complex result transformation
 * Assumes result has { success: boolean, message: string, ...rest }
 */
export function withSimpleToolHandler<TInput, TResult extends { message: string }>(
  schema: z.ZodSchema<TInput>,
  toolName: string,
  handler: (validatedInput: TInput, userId?: number) => Promise<TResult>,
  errorMessagePrefix?: string
) {
  return withToolHandler({
    schema,
    toolName,
    handler,
    toTextContent: (result) => result.message,
    toStructuredContent: (result) => result,
    errorMessagePrefix,
  });
}

/**
 * Tool handler with widget support
 * For tools that return data meant to be displayed in a widget
 */
export function withWidgetToolHandler<TInput, TResult>(
  options: ToolHandlerOptions<TInput, TResult> & {
    /** Widget metadata extractor */
    extractWidgetMeta: (result: TResult) => any;
  }
) {
  const { extractWidgetMeta, ...baseOptions } = options;

  return withToolHandler({
    ...baseOptions,
    toMeta: extractWidgetMeta,
  });
}

/**
 * Build OpenAI widget metadata
 */
export function buildWidgetMeta(
  widgetUri: string,
  options?: {
    invoking?: string;
    invoked?: string;
  }
): any {
  return {
    'openai/outputTemplate': widgetUri,
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    ...(options?.invoking && { 'openai/toolInvocation/invoking': options.invoking }),
    ...(options?.invoked && { 'openai/toolInvocation/invoked': options.invoked }),
  };
}


