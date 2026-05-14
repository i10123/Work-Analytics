/**
 * Модуль для работы с пользовательскими настройками приложения.
 * 
 * Содержит:
 * - SETTINGS_KEY: ключ для хранения настроек в localStorage.
 * - DEFAULT_SETTINGS: объект с настройками по умолчанию.
 * - loadSettings: загрузка настроек из локального хранилища с объединением с дефолтными.
 * - saveSettings: сохранение текущих настроек пользователя.
 */

export const SETTINGS_KEY = 'workanalytics-settings';

export const DEFAULT_SETTINGS = {
  theme: 'slate-modernity',
  defaultCurrency: 'RUB',
  defaultPeriod: '7days',
  defaultLimit: 50,
  sources: { hh: true, rabotaby: true, habr: true },
  stopWords: '',
  deepScrape: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[Settings] ⚠️ Ошибка чтения настроек:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
