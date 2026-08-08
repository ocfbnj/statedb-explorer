import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectLanguage, interpolate, dictionaries } from '../src/i18n';

/**
 * Unit tests for the pure i18n helpers in src/i18n.ts:
 *   - detectLanguage(): resolves the UI language from localStorage / navigator
 *   - interpolate(): replaces `{key}` placeholders in a template
 *   - dictionaries: the 'en' and 'zh' locale maps must expose the same keys
 *
 * The tests deliberately avoid the React components (I18nProvider / useI18n)
 * since those need a rendering harness; the exported pure functions are the
 * testable surface.
 */

/** Persist the language across tests that read it. */
const realLocalStorage = globalThis.localStorage;

beforeEach(() => {
  // Reset any saved language before each test.
  localStorage.removeItem('statedb-explorer.lang');
});

afterEach(() => {
  // Clean up so tests don't leak saved language state into one another.
  localStorage.removeItem('statedb-explorer.lang');
});

describe('detectLanguage', () => {
  it('returns the language saved in localStorage when it is valid', () => {
    localStorage.setItem('statedb-explorer.lang', 'zh');
    expect(detectLanguage()).toBe('zh');

    localStorage.setItem('statedb-explorer.lang', 'en');
    expect(detectLanguage()).toBe('en');
  });

  it('ignores an invalid value saved in localStorage', () => {
    localStorage.setItem('statedb-explorer.lang', 'fr');
    expect(detectLanguage()).toBe('en');
  });

  it('returns zh when navigator.language starts with zh', () => {
    // jsdom exposes navigator.language as 'en-US' by default; override it.
    Object.defineProperty(window.navigator, 'language', {
      value: 'zh-CN',
      configurable: true,
    });
    expect(detectLanguage()).toBe('zh');

    Object.defineProperty(window.navigator, 'language', {
      value: 'zh-Hans-CN',
      configurable: true,
    });
    expect(detectLanguage()).toBe('zh');
  });

  it('returns en for a non-zh navigator.language', () => {
    Object.defineProperty(window.navigator, 'language', {
      value: 'en-US',
      configurable: true,
    });
    expect(detectLanguage()).toBe('en');
  });

  it('falls back to en when navigator.language is empty', () => {
    Object.defineProperty(window.navigator, 'language', {
      value: '',
      configurable: true,
    });
    expect(detectLanguage()).toBe('en');
  });
});

describe('interpolate', () => {
  it('replaces a single placeholder with its value', () => {
    expect(interpolate('{count} sessions', { count: 42 })).toBe('42 sessions');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(interpolate('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('replaces a repeated placeholder everywhere it appears', () => {
    expect(interpolate('{n} {n} {n}', { n: 3 })).toBe('3 3 3');
  });

  it('coerces numeric variable values to strings', () => {
    expect(interpolate('{v}', { v: 12.5 })).toBe('12.5');
  });

  it('leaves a placeholder untouched when the variable is missing', () => {
    expect(interpolate('{missing} hello', {})).toBe('{missing} hello');
  });

  it('leaves a placeholder untouched when the variable is null', () => {
    expect(interpolate('{n}', { n: null })).toBe('{n}');
  });

  it('treats a value of 0 as provided (not "missing")', () => {
    expect(interpolate('{n} msgs', { n: 0 })).toBe('0 msgs');
  });

  it('returns the template unchanged when there are no placeholders', () => {
    expect(interpolate('no placeholders here', { a: 1 })).toBe('no placeholders here');
  });

  it('ignores placeholders wrapped in extra braces or malformed keys', () => {
    expect(interpolate('{{n}} and {n!}', { n: 1 })).toBe('{1} and {n!}');
  });
});

describe('dictionary key parity (en vs zh)', () => {
  it('exposes both locales', () => {
    expect(dictionaries.en).toBeDefined();
    expect(dictionaries.zh).toBeDefined();
  });

  it('has the exact same set of keys in both locales', () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    const zhKeys = Object.keys(dictionaries.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('has no empty or whitespace-only values in either locale', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('has at least one translated entry per locale', () => {
    expect(Object.keys(dictionaries.en).length).toBeGreaterThan(0);
    expect(Object.keys(dictionaries.zh).length).toBeGreaterThan(0);
  });

  it('every key value in zh differs from en (actual translation, not a copy)', () => {
    // Some keys legitimately match (e.g. proper nouns like "StateDB Explorer",
    // or symbols like "···"), so allow a small fraction to be identical.
    // This guards against an accidental copy-paste of the whole dictionary.
    let identical = 0;
    for (const key of Object.keys(dictionaries.en)) {
      if (dictionaries.en[key] === dictionaries.zh[key]) identical += 1;
    }
    const total = Object.keys(dictionaries.en).length;
    const identicalKeys = Object.keys(dictionaries.en).filter(
      (k) => dictionaries.en[k] === dictionaries.zh[k]
    );
    // Allow a small fraction (<= 20%) to be intentionally identical.
    expect(identical).toBeLessThanOrEqual(Math.max(5, Math.ceil(total * 0.2)));
    // Any identical values must be a known intentional exception.
    // These are proper nouns / acronyms / language names / symbols / placeholders
    // that are identical across both locales by design.
    const allowed = new Set([
      'app.name',       // "StateDB Explorer" (proper noun)
      'nav.sql',        // "SQL" (acronym)
      'conv.tokens',    // "{v}" (placeholder only)
      'turn.moreDots',  // "···" (symbol)
      'turn.charCount', // "{n} chars" (placeholder only)
      'schema.pk',      // "PK" (acronym)
      'schema.notNull', // "NOT NULL" (technical term)
      'settings.langEn',// "English" (language name)
      'settings.langZh',// "中文" (language name)
      'status.db',      // "state.db {size}" (proper noun + placeholder)
      'sql.qqTokenTop', // "Token Top 10" (proper noun)
    ]);
    for (const key of identicalKeys) {
      expect(allowed.has(key), `unexpected identical key: ${key}`).toBe(true);
    }
  });

  it('every placeholder in zh templates also exists in the en template (same var names)', () => {
    const extractVars = (template: string) =>
      [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(dictionaries.en)) {
      expect(extractVars(dictionaries.zh[key]), `zh.${key} var mismatch`).toEqual(
        extractVars(dictionaries.en[key])
      );
    }
  });
});

// Keep the reference to the real localStorage so the linter knows it is used
// (and future cleanup could restore it). The import is intentionally unused.
void realLocalStorage;
