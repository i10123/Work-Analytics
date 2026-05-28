const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROFILES_DIR = path.resolve(__dirname, '..', '..', 'data', 'browser_profiles');

function askBrowserAi(options = {}) {
  return new Promise((resolve, reject) => {
    const model = process.env.BROWSER_AI_MODEL || 'deepseek';
    const headless = process.env.BROWSER_AI_HEADLESS !== 'false';
    const thinking = options.thinking !== undefined ? !!options.thinking : process.env.BROWSER_AI_THINKING !== 'false';
    const search = process.env.BROWSER_AI_SEARCH === 'true';

    const prompt = options.prompt;
    if (!prompt) {
      return reject(new Error('Prompt is required'));
    }

    const profileDir = path.join(PROFILES_DIR, model);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const bridgePath = path.join(__dirname, 'browser_ai_bridge.py');
    const args = [
      bridgePath,
      '--model', model,
      '--profile-dir', profileDir,
      '--prompt', prompt,
    ];

    if (headless) args.push('--headless');
    if (thinking) args.push('--thinking');
    if (search) args.push('--search');

    console.log(`[BrowserAI] 🌐 Запуск Python-процесса для модели ${model}...`);
    console.log(`[BrowserAI] 📁 Профиль: ${profileDir}`);
    console.log(`[BrowserAI] ⚙️ Headless: ${headless}, Thinking: ${thinking}, Search: ${search}`);

    const pyProcess = spawn('python', args);
    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[BrowserAI] ❌ Ошибка Python-моста (код ${code}):`, stderrData);
        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (parsed && parsed.error) {
            return reject(new Error(parsed.error));
          }
        } catch (e) { }

        return reject(new Error(stderrData.trim() || `Python-процесс завершился с кодом ${code}`));
      }

      try {
        const response = JSON.parse(stdoutData.trim());
        if (response.success) {
          console.log(`[BrowserAI] ✅ Ответ от ИИ успешно получен.`);
          resolve(response.result);
        } else {
          reject(new Error(response.error || 'Неизвестная ошибка ИИ'));
        }
      } catch (err) {
        console.error('[BrowserAI] ❌ Не удалось распарсить JSON-ответ:', stdoutData);
        reject(new Error(`Ошибка парсинга JSON: ${err.message}`));
      }
    });

    pyProcess.on('error', (err) => {
      console.error('[BrowserAI] ❌ Ошибка запуска Python:', err.message);
      reject(new Error(`Не удалось запустить Python: ${err.message}`));
    });
  });
}

module.exports = {
  askBrowserAi,
  PROFILES_DIR
};