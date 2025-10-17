/**
 * Shared React Hooks
 * Reusable hooks for widget components
 */

import { useEffect, useState } from 'react';
import { SET_GLOBALS_EVENT_TYPE, type OpenAiGlobals } from '../../types/openai.js';

/**
 * Hook to access OpenAI global values with reactivity
 * Automatically updates when globals change
 * 
 * @example
 * ```tsx
 * const theme = useOpenAiGlobal('theme');
 * const toolOutput = useOpenAiGlobal('toolOutput');
 * ```
 */
export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(key: K): OpenAiGlobals[K] {
  const [value, setValue] = useState<OpenAiGlobals[K]>(() => window.openai[key] as OpenAiGlobals[K]);

  useEffect(() => {
    function handleSetGlobals(event: CustomEvent<{ globals: Partial<OpenAiGlobals> }>) {
      const nextValue = event.detail.globals[key];
      if (nextValue !== undefined) {
        setValue(nextValue as OpenAiGlobals[K]);
      }
    }

    window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobals as EventListener);
    return () => {
      window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobals as EventListener);
    };
  }, [key]);

  return value;
}

