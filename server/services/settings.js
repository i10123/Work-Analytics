const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'settings.json');

const DEFAULT_SETTINGS = {
  theme: 'slate-modernity',
  defaultCurrency: 'BYN',
  defaultPeriod: '7days',
  defaultLimit: 50,
  sources: { hh: true, rabotaby: true, habr: true },
  stopWords: '',
  deepScrape: false,
};

async function getSettings() {
  try {
    const data = await fs.promises.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Settings] ❌ Ошибка чтения настроек:', err.message);
    }
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings) {
  try {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await fs.promises.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (err) {
    console.error('[Settings] ❌ Ошибка сохранения настроек:', err.message);
    throw err;
  }
}

module.exports = {
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS
};
