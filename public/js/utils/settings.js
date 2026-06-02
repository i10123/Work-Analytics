export const SETTINGS_KEY = 'workanalytics-settings';

export const DEFAULT_SETTINGS = {
  theme: 'slate-modernity',
  defaultCurrency: 'BYN',
  defaultPeriod: '7days',
  defaultLimit: 50,
  sources: { hh: true, rabotaby: true, habr: true },
  stopWords: '',
  deepScrape: false,
};

let currentSettings = { ...DEFAULT_SETTINGS };


try {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  }
} catch (e) {
  console.warn('[Settings] ⚠️ Ошибка чтения локальных настроек:', e);
}

// Асинхронная инициализация настроек (загрузка с сервера и синхронизация с локальным хранилищем)
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
  return currentSettings;
}

// Синхронное получение копии текущих настроек из оперативной памяти
export function loadSettings() {
  return { ...currentSettings };
}

// Сохранение настроек в памяти, локальном хранилище и отправка изменений на сервер
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