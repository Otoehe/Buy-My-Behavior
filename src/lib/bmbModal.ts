export type BmbAlertPayload = {
  title: string;
  description?: string;
  confirmText?: string;
  tone?: 'pink' | 'default';
};

export function openBmbAlert(payload: BmbAlertPayload) {
  // Уніфікована подія для BMBModalHost
  window.dispatchEvent(new CustomEvent('bmb:alert', { detail: payload }));
}

// Готова кнопка саме для «реферального слова»
export function openReferralRequired() {
  openBmbAlert({
    title: 'Реєстрація лише за реферальним словом',
    description:
      'Введіть реферальне слово амбасадора, щоб продовжити. Якщо коду немає — зверніться до амбасадора BMB.',
    confirmText: 'Добре',
    tone: 'pink',
  });
}
