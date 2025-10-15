// src/components/LanguageSwitcher.tsx
import React from 'react';
import i18n from 'i18next';

export default function LanguageSwitcher() {
  const current = i18n.language || 'uk';
  const switchTo = (lng: 'uk' | 'en') => i18n.changeLanguage(lng);

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => switchTo('uk')} aria-pressed={current.startsWith('uk')}>
        UA
      </button>
      <button onClick={() => switchTo('en')} aria-pressed={current.startsWith('en')}>
        EN
      </button>
    </div>
  );
}
