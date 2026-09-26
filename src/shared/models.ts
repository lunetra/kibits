// Gemini model registry (docs/04 → "Models"). New ids are one-line additions.

export type ModelId = 'gemini-3.1-flash-lite' | 'gemini-3.5-flash-lite' | 'gemini-2.5-flash-lite' | 'gemma-4-31b-it';

export interface ModelInfo {
  id: ModelId;
  label: string;
  hint: string;
  /** JSON structured output (responseJsonSchema) is reliable for this model. */
  structuredOutput: boolean;
  /** How to switch thinking off: Gemini 3.x/Gemma use thinkingLevel, 2.5 uses thinkingBudget. */
  thinking: 'level' | 'budget';
  /** Explicit temperature; undefined = model default (Gemini 3.x guidance). */
  temperature?: number;
}

export const MODELS: Record<ModelId, ModelInfo> = {
  'gemini-3.1-flash-lite': { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', hint: 'default', structuredOutput: true, thinking: 'level' },
  'gemini-3.5-flash-lite': { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'newest', structuredOutput: true, thinking: 'level' },
  'gemini-2.5-flash-lite': { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', hint: 'older', structuredOutput: true, thinking: 'budget' },
  'gemma-4-31b-it': { id: 'gemma-4-31b-it', label: 'Gemma 4 31B', hint: 'open', structuredOutput: false, thinking: 'level', temperature: 0.3 },
};

export const MODEL_ORDER: ModelId[] = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemma-4-31b-it'];

export const DEFAULT_MODEL: ModelId = 'gemini-3.1-flash-lite';

export const isModelId = (v: unknown): v is ModelId => typeof v === 'string' && v in MODELS;
