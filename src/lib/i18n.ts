// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// Ініціалізація i18next з завантаженням JSON із /public/locales/{lng}/{ns}.json
i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'uk',
    supportedLngs: ['uk', 'en'],
    defaultNS: 'common',
    ns: ['common'],
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    backend: {
      // шлях до JSON файлів перекладів
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
