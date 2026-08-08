import { createContext, useContext, useState, ReactNode } from 'react';
import { Lang, detectLanguage, saveLanguage, translate } from './i18n';

/**
 * React context for the current UI language. Provides a `t(key, vars)`
 * translation function. The provider is mounted once in main.tsx.
 */

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLanguage());

  function setLang(l: Lang) {
    setLangState(l);
    saveLanguage(l);
  }

  const value: I18nContextValue = {
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
