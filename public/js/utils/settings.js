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

let currentSettings = { ...DEFAULT_SETTINGS };

export async function initSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
        return currentSettings;
      }
    }
  } catch (err) {
    console.warn('[Settings] ⚠️ Ошибка загрузки настроек с сервера:', err);
  }
  
  // Fallback to local
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[Settings] ⚠️ Ошибка чтения локальных настроек:', e);
  }
  return currentSettings;
}

export function loadSettings() {
  return { ...currentSettings };
}

export async function saveSettings(settings) {
  currentSettings = { ...currentSettings, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
  
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentSettings)
    });
  } catch (err) {
    console.warn('[Settings] ⚠️ Ошибка сохранения настроек на сервер:', err);
  }
}
