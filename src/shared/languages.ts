// Language registry (docs/05 → "Language registry"). Adding a language = one entry + glossary/<code>.json.

export type LangCode = 'fa' | 'de' | 'en';

export interface Language {
  code: LangCode;
  label: string;
  native: string;
  /** English name used inside the prompt. */
  promptName: string;
  dir: 'ltr' | 'rtl';
  font: string;
  lineHeight: number | null;
  passthrough?: boolean;
}

export const LANGUAGES: Record<LangCode, Language> = {
  fa: {
    code: 'fa',
    label: 'Persian',
    native: 'فارسی',
    promptName: 'Persian (Farsi)',
    dir: 'rtl',
    font: "'Kibitz Vazirmatn', 'Vazirmatn Variable', Tahoma, sans-serif",
    lineHeight: 1.8,
  },
  de: { code: 'de', label: 'German', native: 'Deutsch', promptName: 'German', dir: 'ltr', font: 'inherit', lineHeight: null },
  en: {
    code: 'en',
    label: 'English',
    native: 'English',
    promptName: 'English',
    dir: 'ltr',
    font: 'inherit',
    lineHeight: null,
    passthrough: true,
  },
};

export const LANG_ORDER: LangCode[] = ['fa', 'en', 'de'];

export const isLangCode = (v: unknown): v is LangCode => typeof v === 'string' && v in LANGUAGES;
