/**
 * Shared OpenAI widget types
 */

export type DisplayMode = 'pip' | 'inline' | 'fullscreen';

export type OpenAiApi = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
  }>;
  requestDisplayMode: (args: { mode: DisplayMode }) => Promise<{ mode: DisplayMode }>;
  setWidgetState?: (state: any) => Promise<void>;
};

export type OpenAiGlobals = {
  theme: 'light' | 'dark';
  maxHeight: number;
  displayMode: DisplayMode;
  toolOutput: any;
  toolInput?: any;
  widgetState?: any;
};

declare global {
  interface Window {
    openai: OpenAiApi & OpenAiGlobals;
    addEventListener(type: 'openai:set_globals', listener: (event: CustomEvent<{ globals: Partial<OpenAiGlobals> }>) => void): void;
    removeEventListener(type: 'openai:set_globals', listener: (event: CustomEvent<{ globals: Partial<OpenAiGlobals> }>) => void): void;
  }
}

export const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';

