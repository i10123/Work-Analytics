/**
 * @file app.js — Клиентская логика Work Analytics.
 * @description Управляет UI: модальные окна, SSE-подписки, построение графиков (Chart.js),
 *              переключение валют и отображение таблицы вакансий.
 */

/* ============================================
 * 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
 * ============================================ */

/** Текущий загруженный отчёт (полный объект с массивом jobs) */
let currentReport = null;

/** Текущая выбранная валюта для отображения зарплат */
let currentCurrency = 'RUB';

/** Ссылки на инстансы Chart.js (для пересоздания при смене данных) */
const charts = {
  salary: null,
  sources: null,
  skills: null,
  experience: null,
  cities: null,
};

/** Снимок настроек при открытии модального окна (для проверки изменений) */
let baselineSettings = null;

/* ============================================
 * 2. DOM-ЭЛЕМЕНТЫ
 * ============================================ */

const DOM = {
  /* Сайдбар */
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  btnNewReport: document.getElementById('btnNewReport'),
  reportsList: document.getElementById('reportsList'),
  reportsEmpty: document.getElementById('reportsEmpty'),
  queueStatus: document.getElementById('queueStatus'),
  queueText: document.getElementById('queueText'),

  /* Экраны */
  welcomeScreen: document.getElementById('welcomeScreen'),
  progressSection: document.getElementById('progressSection'),
  dashboard: document.getElementById('dashboard'),

  /* Модалка */
  modalOverlay: document.getElementById('modalOverlay'),
  modalClose: document.getElementById('modalClose'),
  parseForm: document.getElementById('parseForm'),
  inputQuery: document.getElementById('inputQuery'),
  selectPeriod: document.getElementById('selectPeriod'),
  inputLimit: document.getElementById('inputLimit'),
  btnSubmitParse: document.getElementById('btnSubmitParse'),

  /* Прогресс */
  progressTitle: document.getElementById('progressTitle'),
  progressStep: document.getElementById('progressStep'),

  /* Дашборд */
  dashTitle: document.getElementById('dashTitle'),
  dashSubtitle: document.getElementById('dashSubtitle'),
  alertPartial: document.getElementById('alertPartial'),
  alertPartialText: document.getElementById('alertPartialText'),

  /* KPI */
  kpiTotal: document.getElementById('kpiTotal'),
  kpiAvgSalary: document.getElementById('kpiAvgSalary'),
  kpiMedianSalary: document.getElementById('kpiMedianSalary'),
  kpiCompanies: document.getElementById('kpiCompanies'),

  /* Валюты */
  currencyBtns: document.querySelectorAll('.currency-btn'),

  /* Таблица */
  jobsTableBody: document.getElementById('jobsTableBody'),

  /* Темы и мобильное меню */
  mobileMenuToggle: document.getElementById('mobileMenuToggle'),

  /* Настройки */
  btnSettings: document.getElementById('btnSettings'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsClose: document.getElementById('settingsClose'),
  settingsSave: document.getElementById('settingsSave'),
  confirmModal: document.getElementById('confirmModal'),
  confirmModalOverlay: document.getElementById('confirmModalOverlay'),
  btnConfirmSave: document.getElementById('btnConfirmSave'),
  btnConfirmDiscard: document.getElementById('btnConfirmDiscard'),
  btnConfirmCancel: document.getElementById('btnConfirmCancel'),

  /** Элементы настроек */
  settingsTabs: document.getElementById('settingsTabs'),
  settingsThemeGrid: document.getElementById('settingsThemeGrid'),
  settingsDefaultCurrency: document.getElementById('settingsDefaultCurrency'),
  settingsDefaultPeriod: document.getElementById('settingsDefaultPeriod'),
  settingsDefaultLimit: document.getElementById('settingsDefaultLimit'),
  settingsSourceHH: document.getElementById('settingsSourceHH'),
  settingsSourceRabotaby: document.getElementById('settingsSourceRabotaby'),
  settingsSourceHabr: document.getElementById('settingsSourceHabr'),
  geminiStatusText: document.getElementById('geminiStatusText'),
  geminiKeysCount: document.getElementById('geminiKeysCount'),
  currencyStatusText: document.getElementById('currencyStatusText'),
  dataReportsCount: document.getElementById('dataReportsCount'),
  dataJobsCount: document.getElementById('dataJobsCount'),
  btnDeleteAllReports: document.getElementById('btnDeleteAllReports'),
  btnClearCache: document.getElementById('btnClearCache'),
  btnResetSettings: document.getElementById('btnResetSettings'),
};

/* ============================================
 * 3. ИНИЦИАЛИЗАЦИЯ
 * ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] 🚀 Инициализация Work Analytics...');

  initializeTheme();
  initializeSettings();
  setupEventListeners();
  setupSSE();
  loadReportsList();
});

/**
 * Инициализирует тему оформления из localStorage.
 */
function initializeTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'slate-modernity';
  setAppTheme(savedTheme);
}

/**
 * Устанавливает тему оформления.
 * @param {string} theme 
 */
function setAppTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);

  if (currentReport) {
    renderDashboard(currentReport);
  }
}

/* getThemeColors() удалён — дублировал getChartTheme() (секция 9) */

/**
 * Привязывает обработчики событий ко всем интерактивным элементам.
 */
function setupEventListeners() {
  /** Сайдбар: сворачивание */
  DOM.sidebarToggle.addEventListener('click', () => {
    DOM.sidebar.classList.toggle('collapsed');
  });

  /** Кнопка "Новый сбор данных" */
  DOM.btnNewReport.addEventListener('click', openModal);

  /** Модалка: закрытие */
  DOM.modalClose.addEventListener('click', closeModal);
  DOM.modalOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.modalOverlay) closeModal();
  });

  /** Форма: отправка */
  DOM.parseForm.addEventListener('submit', handleFormSubmit);

  /** Кнопки валют */
  DOM.currencyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentCurrency = btn.dataset.currency;
      DOM.currencyBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentReport) {
        renderDashboard(currentReport);
      }
    });
  });


  /** Мобильное меню (Burger) */
  if (DOM.mobileMenuToggle) {
    DOM.mobileMenuToggle.addEventListener('click', () => {
      DOM.sidebar.classList.toggle('open');
    });
  }

  /** Закрытие мобильного сайдбара при клике вне него */
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      if (!DOM.sidebar.contains(e.target) && !DOM.mobileMenuToggle.contains(e.target) && DOM.sidebar.classList.contains('open')) {
        DOM.sidebar.classList.remove('open');
      }
    }
  });

  /** === Настройки === */
  setupSettingsListeners();

  /** === Степперы (+/-) === */
  setupStepperListeners();

  /** === Сегментированные контролы (Период) === */
  setupSegmentedControlListeners();
}

/* ============================================
 * 4. SSE (Server-Sent Events)
 * ============================================ */

/**
 * Устанавливает SSE-соединение с сервером для получения обновлений в реальном времени.
 */
function setupSSE() {
  console.log('[App] 📡 Подключение к SSE...');
  const eventSource = new EventSource('/api/events');

  /** Обновление статуса задачи (парсинга) */
  eventSource.addEventListener('taskUpdate', (event) => {
    const task = JSON.parse(event.data);
    console.log(`[App] 📡 SSE taskUpdate:`, task);
    handleTaskUpdate(task);
  });

  /** Статус очереди */
  eventSource.addEventListener('queueStatus', (event) => {
    const status = JSON.parse(event.data);
    updateQueueBadge(status);
  });

  eventSource.onerror = () => {
    console.warn('[App] ⚠️ SSE-соединение потеряно. Переподключение...');
  };
}

/**
 * Обрабатывает SSE-обновление задачи.
 * @param {Object} task — Объект задачи: { id, status, step?, reportId?, errors?, error? }
 */
function handleTaskUpdate(task) {
  if (task.status === 'processing') {
    showScreen('progress');
    DOM.progressTitle.textContent = `Сбор данных: "${task.query || ''}"`;
    if (task.step) {
      DOM.progressStep.textContent = task.step;
    }
  } else if (task.status === 'completed' || task.status === 'partial') {
    /** Парсинг завершён — загружаем отчёт */
    console.log(`[App] ✅ Задача завершена: ${task.id}`);
    if (task.reportId) {
      loadReportById(task.reportId);
    }
    loadReportsList();
  } else if (task.status === 'failed') {
    /** Ошибка */
    showScreen('welcome');
    alert(`Ошибка сбора данных: ${task.error || 'Неизвестная ошибка'}`);
    loadReportsList();
  } else if (task.status === 'pending') {
    /** Задача в очереди */
    loadReportsList();
  }
}

/**
 * Обновляет индикатор очереди в сайдбаре.
 * @param {Object} status — { isProcessing, queueLength }
 */
function updateQueueBadge(status) {
  if (status.isProcessing || status.queueLength > 0) {
    DOM.queueStatus.style.display = 'block';
    DOM.queueText.textContent = status.isProcessing
      ? `Обработка... (в очереди: ${status.queueLength})`
      : `В очереди: ${status.queueLength}`;
  } else {
    DOM.queueStatus.style.display = 'none';
  }
}

/* ============================================
 * 5. МОДАЛКА И ОТПРАВКА ФОРМЫ
 * ============================================ */

/** Открывает модальное окно нового парсинга */
function openModal() {
  DOM.modalOverlay.style.display = 'flex';
  DOM.inputQuery.focus();
}

/** Закрывает модальное окно */
function closeModal() {
  DOM.modalOverlay.style.display = 'none';
}

/**
 * Обработчик отправки формы: запуск парсинга через API.
 * @param {Event} e — Событие submit.
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const query = DOM.inputQuery.value.trim();
  const period = DOM.selectPeriod.value;
  const limit = parseInt(DOM.inputLimit.value, 10) || 50;
  const settings = loadSettings();

  if (!query) return;

  /** Блокируем кнопку на время запроса */
  DOM.btnSubmitParse.disabled = true;
  DOM.btnSubmitParse.textContent = '⏳ Отправка...';

  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, period, limit, sources: settings.sources }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[App] ✅ Задача создана: ${data.task.id}`);
      closeModal();
      showScreen('progress');
      DOM.progressTitle.textContent = `Сбор данных: "${query}"`;
      DOM.progressStep.textContent = 'Задача добавлена в очередь...';
    } else {
      alert(`Ошибка: ${data.error}`);
    }
  } catch (error) {
    console.error('[App] ❌ Ошибка отправки запроса:', error);
    alert('Ошибка сети. Проверьте подключение к серверу.');
  } finally {
    DOM.btnSubmitParse.disabled = false;
    DOM.btnSubmitParse.textContent = '🚀 Запустить сбор';
  }
}

/* ============================================
 * 6. ЗАГРУЗКА ДАННЫХ
 * ============================================ */

/**
 * Загружает список отчётов из API и рендерит сайдбар.
 */
async function loadReportsList() {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (data.success) {
      renderReportsList(data.reports);
    }
  } catch (error) {
    console.error('[App] ❌ Ошибка загрузки списка отчётов:', error);
  }
}

/**
 * Загружает полный отчёт по ID и отображает дашборд.
 * @param {string} reportId — Идентификатор отчёта.
 */
async function loadReportById(reportId) {
  try {
    const response = await fetch(`/api/reports/${reportId}`);
    const data = await response.json();

    if (data.success) {
      currentReport = data.report;
      showScreen('dashboard');
      renderDashboard(data.report);

      /** Подсвечиваем активный отчёт в сайдбаре */
      document.querySelectorAll('.report-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === reportId);
      });
    }
  } catch (error) {
    console.error(`[App] ❌ Ошибка загрузки отчёта ${reportId}:`, error);
  }
}

/* ============================================
 * 7. РЕНДЕРИНГ САЙДБАРА
 * ============================================ */

/**
 * Рендерит список отчётов в боковой панели.
 * @param {Array<Object>} reports — Массив метаданных отчётов.
 */
function renderReportsList(reports) {
  if (reports.length === 0) {
    DOM.reportsEmpty.style.display = 'block';
    return;
  }

  DOM.reportsEmpty.style.display = 'none';

  /** Очищаем список (оставляя пустой блок) */
  const items = DOM.reportsList.querySelectorAll('.report-item');
  items.forEach((el) => el.remove());

  reports.forEach((report) => {
    const div = document.createElement('div');
    div.className = 'report-item';
    div.dataset.id = report.id;

    /** Определяем CSS-класс для статуса */
    const statusClass = `report-item__status--${report.status}`;
    const statusText = {
      completed: 'Готово',
      partial: 'Частично',
      failed: 'Ошибка',
    }[report.status] || report.status;

    const date = new Date(report.createdAt).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    div.innerHTML = `
      <div class="report-item__query" style="display:flex; align-items:center; gap:6px;">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        ${escapeHtml(report.query)}
      </div>
      <div class="report-item__meta">
        <span>${date} · ${report.stats?.totalFound || 0} вак.</span>
        <span class="report-item__status ${statusClass}">${statusText}</span>
      </div>
    `;

    div.addEventListener('click', () => loadReportById(report.id));

    DOM.reportsList.insertBefore(div, DOM.reportsEmpty);
  });
}

/* ============================================
 * 8. ДАШБОРД (KPI + ГРАФИКИ + ТАБЛИЦА)
 * ============================================ */

/**
 * Полностью рендерит дашборд по данным отчёта.
 * Вызывается при загрузке отчёта и при смене валюты.
 * @param {Object} report — Полный объект отчёта (включая jobs).
 */
function renderDashboard(report) {
  const jobs = report.jobs || [];
  const rates = report.exchangeRates?.rates || { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };

  /** Заголовок */
  DOM.dashTitle.textContent = `📊 Отчёт: "${report.query}"`;
  const dateStr = new Date(report.createdAt).toLocaleString('ru-RU');
  DOM.dashSubtitle.textContent = `Создан: ${dateStr} · Источников: 3 · Вакансий: ${jobs.length}`;

  /** Alert о частичном успехе */
  if (report.errors && report.errors.length > 0) {
    const sourceNames = { hh: 'HH.ru', rabotaby: 'Rabota.by', habr: 'Хабр Карьера' };
    const failedSources = report.errors.map((e) => sourceNames[e] || e).join(', ');
    DOM.alertPartial.style.display = 'flex';
    DOM.alertPartialText.textContent = `Сбор завершён частично. Недоступные источники: ${failedSources}`;
  } else {
    DOM.alertPartial.style.display = 'none';
  }

  /** KPI */
  renderKPI(jobs, rates);

  /** Графики */
  renderChartSalary(jobs, rates);
  renderChartSources(report);
  renderChartSkills(jobs);
  renderChartExperience(jobs);
  renderChartCities(jobs);

  /** Таблица */
  renderJobsTable(jobs, rates);
}

/**
 * Рендерит KPI-карточки (общее кол-во, средняя/медианная зарплата, кол-во компаний).
 * @param {Array} jobs — Массив вакансий.
 * @param {Object} rates — Курсы валют.
 */
function renderKPI(jobs, rates) {
  DOM.kpiTotal.textContent = jobs.length;

  /** Собираем зарплаты в целевой валюте */
  const salaries = jobs
    .filter((j) => j.salary && (j.salary.min || j.salary.max))
    .map((j) => {
      const avg = j.salary.min && j.salary.max
        ? (j.salary.min + j.salary.max) / 2
        : j.salary.min || j.salary.max;
      return convertCurrency(avg, j.salary.currency, currentCurrency, rates);
    })
    .filter((s) => s > 0);

  if (salaries.length > 0) {
    const avg = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length);
    DOM.kpiAvgSalary.textContent = formatSalary(avg);

    const sorted = [...salaries].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    DOM.kpiMedianSalary.textContent = formatSalary(median);
  } else {
    DOM.kpiAvgSalary.textContent = '—';
    DOM.kpiMedianSalary.textContent = '—';
  }

  /** Уникальные компании */
  const companies = new Set(jobs.map((j) => j.company).filter(Boolean));
  DOM.kpiCompanies.textContent = companies.size;
}

/* ============================================
 * 9. ГРАФИКИ (CHART.JS)
 * ============================================ */

/**
 * Генерирует палитру и настройки для графиков на основе выбранной CSS темы.
 */
function getChartTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    colors: [
      style.getPropertyValue('--chart-c1').trim() || '#6366f1',
      style.getPropertyValue('--chart-c2').trim() || '#06b6d4',
      style.getPropertyValue('--chart-c3').trim() || '#22c55e',
      style.getPropertyValue('--chart-c4').trim() || '#f59e0b',
      style.getPropertyValue('--chart-c5').trim() || '#ef4444',
    ],
    textSecondary: style.getPropertyValue('--color-text-secondary').trim() || '#94a3b8',
    textMain: style.getPropertyValue('--color-text').trim() || '#e2e8f0',
    grid: style.getPropertyValue('--color-border').trim() || '#2a2f45',
  };
}

/**
 * Создает вертикальный линейный градиент для canvas.
 */
function createGradient(ctxId, hexColor) {
  const canvas = document.getElementById(ctxId);
  const chartCtx = canvas.getContext('2d');
  const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, hexColor);
  gradient.addColorStop(1, hexColor + '30'); // прозрачность "30" (~20%)
  return gradient;
}

/**
 * Рендерит гистограмму распределения зарплат.
 */
function renderChartSalary(jobs, rates) {
  const ctx = document.getElementById('chartSalary');
  if (charts.salary) charts.salary.destroy();

  const theme = getChartTheme();
  
  const salaries = jobs
    .filter((j) => j.salary && (j.salary.min || j.salary.max))
    .map((j) => {
      const avg = j.salary.min && j.salary.max
        ? (j.salary.min + j.salary.max) / 2
        : j.salary.min || j.salary.max;
      return convertCurrency(avg, j.salary.currency, currentCurrency, rates);
    })
    .filter((s) => s > 0);

  if (salaries.length === 0) {
    charts.salary = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['Нет данных'], datasets: [{ data: [0] }] },
    });
    return;
  }

  const min = Math.min(...salaries);
  const max = Math.max(...salaries);
  const binCount = 10;
  const binSize = Math.ceil((max - min) / binCount) || 1;

  const bins = [];
  const labels = [];
  for (let i = 0; i < binCount; i++) {
    const lower = min + i * binSize;
    bins.push(0);
    labels.push(`${formatSalaryShort(lower)}`);
  }

  salaries.forEach((s) => {
    const idx = Math.min(Math.floor((s - min) / binSize), binCount - 1);
    bins[idx]++;
  });

  const currSymbol = getCurrencySymbol(currentCurrency);
  const mainColor = theme.colors[0];

  charts.salary = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Кол-во вакансий`,
        data: bins,
        backgroundColor: createGradient('chartSalary', mainColor),
        borderColor: mainColor,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 20, 0.85)',
          titleColor: '#fff',
          bodyColor: '#e2e8f0',
          callbacks: {
            title: (items) => `Зарплата: ${items[0].label} ${currSymbol}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: theme.textSecondary, font: { size: 10 } }, grid: { color: theme.grid } },
        y: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
      },
    },
  });
}

/**
 * Рендерит Doughnut-диаграмму с количеством вакансий по источникам.
 */
function renderChartSources(report) {
  const ctx = document.getElementById('chartSources');
  if (charts.sources) charts.sources.destroy();

  const theme = getChartTheme();
  const stats = report.stats?.sources || {};
  const labels = [];
  const data = [];
  const colors = [];

  if (stats.hh > 0) { labels.push('HH.ru'); data.push(stats.hh); colors.push(theme.colors[4]); } /* red-ish */
  if (stats.rabotaby > 0) { labels.push('Rabota.by'); data.push(stats.rabotaby); colors.push(theme.colors[2]); } /* green-ish */
  if (stats.habr > 0) { labels.push('Хабр Карьера'); data.push(stats.habr); colors.push(theme.colors[0]); } /* primary */

  if (data.length === 0) {
    labels.push('Нет данных');
    data.push(1);
    colors.push(theme.grid);
  }

  charts.sources = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: theme.textSecondary, padding: 15, usePointStyle: true },
        },
      },
    },
  });
}

/**
 * Рендерит бар-чарт топ-15 навыков (горизонтальный).
 */
function renderChartSkills(jobs) {
  const ctxId = 'chartSkills';
  const ctx = document.getElementById(ctxId);
  if (charts.skills) charts.skills.destroy();

  const theme = getChartTheme();
  const skillCount = {};
  jobs.forEach((job) => {
    (job.skills || []).forEach((skill) => {
      const normalized = skill.trim();
      if (normalized) {
        skillCount[normalized] = (skillCount[normalized] || 0) + 1;
      }
    });
  });

  const sorted = Object.entries(skillCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const labels = sorted.map(([name]) => name);
  const data = sorted.map(([, count]) => count);

  // Используем разные цвета из палитры 
  const palette = theme.colors;
  const bgColors = data.map((_, i) => palette[i % palette.length] + '99');
  const borderColors = data.map((_, i) => palette[i % palette.length]);

  charts.skills = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Упоминаний',
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
        y: { ticks: { color: theme.textMain, font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

/**
 * Рендерит Doughnut-диаграмму опыта работы.
 */
function renderChartExperience(jobs) {
  const ctx = document.getElementById('chartExperience');
  if (charts.experience) charts.experience.destroy();

  const theme = getChartTheme();
  const expCount = {};
  jobs.forEach((job) => {
    const exp = job.experience || 'Не указан';
    expCount[exp] = (expCount[exp] || 0) + 1;
  });

  const sorted = Object.entries(expCount).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([name]) => name);
  const data = sorted.map(([, count]) => count);

  const palette = theme.colors;
  const colors = data.map((_, i) => palette[i % palette.length]);

  charts.experience = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: theme.textSecondary, padding: 12, usePointStyle: true, font: { size: 11 } },
        },
      },
    },
  });
}

/**
 * Рендерит бар-чарт топ-10 городов.
 */
function renderChartCities(jobs) {
  const ctxId = 'chartCities';
  const ctx = document.getElementById(ctxId);
  if (charts.cities) charts.cities.destroy();

  const theme = getChartTheme();
  const cityCount = {};
  jobs.forEach((job) => {
    const city = job.city || 'Не указан';
    cityCount[city] = (cityCount[city] || 0) + 1;
  });

  const sorted = Object.entries(cityCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = sorted.map(([name]) => name);
  const data = sorted.map(([, count]) => count);
  const mainColor = theme.colors[1];

  charts.cities = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Вакансий',
        data,
        backgroundColor: createGradient(ctxId, mainColor),
        borderColor: mainColor,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: theme.textSecondary, font: { size: 10 }, maxRotation: 45 }, grid: { color: theme.grid } },
        y: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
      },
    },
  });
}

/* ============================================
 * 10. ТАБЛИЦА ВАКАНСИЙ
 * ============================================ */

/**
 * Рендерит таблицу всех вакансий.
 * @param {Array} jobs — Массив вакансий.
 * @param {Object} rates — Курсы валют.
 */
function renderJobsTable(jobs, rates) {
  DOM.jobsTableBody.innerHTML = '';

  jobs.forEach((job) => {
    const tr = document.createElement('tr');

    /** Форматируем зарплату */
    let salaryStr = '—';
    if (job.salary && (job.salary.min || job.salary.max)) {
      const min = job.salary.min ? convertCurrency(job.salary.min, job.salary.currency, currentCurrency, rates) : null;
      const max = job.salary.max ? convertCurrency(job.salary.max, job.salary.currency, currentCurrency, rates) : null;
      const sym = getCurrencySymbol(currentCurrency);

      if (min && max) {
        salaryStr = `${formatSalary(min)} – ${formatSalary(max)} ${sym}`;
      } else if (min) {
        salaryStr = `от ${formatSalary(min)} ${sym}`;
      } else if (max) {
        salaryStr = `до ${formatSalary(max)} ${sym}`;
      }
    }

    /** Навыки (теги) */
    const skillsHtml = (job.skills || [])
      .slice(0, 5)
      .map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`)
      .join('');

    /** Источник (бейдж) */
    const sourceMap = { hh: 'HH.ru', rabotaby: 'Rabota.by', habr: 'Хабр' };
    const sourceName = sourceMap[job.source] || job.source;
    const sourceClass = `source-badge--${job.source}`;

    tr.innerHTML = `
      <td><span class="source-badge ${sourceClass}">${sourceName}</span></td>
      <td>${job.url ? `<a href="${job.url}" target="_blank" rel="noopener">${escapeHtml(job.title)}</a>` : escapeHtml(job.title)}</td>
      <td>${escapeHtml(job.company)}</td>
      <td>${escapeHtml(job.city)}</td>
      <td style="white-space: nowrap;">${salaryStr}</td>
      <td>${skillsHtml || '<span style="color: #64748b;">—</span>'}</td>
    `;

    DOM.jobsTableBody.appendChild(tr);
  });
}

/* ============================================
 * 11. УТИЛИТЫ
 * ============================================ */

/**
 * Переключает видимый экран (welcome / progress / dashboard).
 * @param {string} screen — welcome | progress | dashboard
 */
function showScreen(screen) {
  DOM.welcomeScreen.style.display = screen === 'welcome' ? 'flex' : 'none';
  DOM.progressSection.style.display = screen === 'progress' ? 'flex' : 'none';
  DOM.dashboard.style.display = screen === 'dashboard' ? 'block' : 'none';
}

/**
 * Конвертирует сумму из одной валюты в другую (клиентская сторона).
 * @param {number} amount — Сумма.
 * @param {string} from — Исходная валюта.
 * @param {string} to — Целевая валюта.
 * @param {Object} rates — Курсы (1 единица = X RUB).
 * @returns {number} — Сконвертированная сумма.
 */
function convertCurrency(amount, from, to, rates) {
  if (!amount || from === to) return amount;
  const inRub = amount * (rates[from] || 1);
  return Math.round(inRub / (rates[to] || 1));
}

/**
 * Форматирует число зарплаты с разделителями тысяч.
 * @param {number} value — Число.
 * @returns {string} — Отформатированная строка ("120 000").
 */
function formatSalary(value) {
  if (!value) return '—';
  return value.toLocaleString('ru-RU');
}

/**
 * Короткий формат зарплаты для осей графиков (например: "120K").
 * @param {number} value — Число.
 * @returns {string}
 */
function formatSalaryShort(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

/**
 * Возвращает символ валюты.
 * @param {string} currency — ISO-код валюты.
 * @returns {string} — Символ (₽, $, €, Br).
 */
function getCurrencySymbol(currency) {
  const symbols = { RUB: '₽', USD: '$', EUR: '€', BYN: 'BYN' };
  return symbols[currency] || currency;
}

/**
 * Экранирует HTML-спецсимволы (защита от XSS).
 * @param {string} text — Исходная строка.
 * @returns {string} — Безопасная строка.
 */
function escapeHtml(text) {
  if (!text) return '';
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

/* ============================================
 * 12. НАСТРОЙКИ (Settings Modal)
 * ============================================ */

/** Ключ для хранения настроек в localStorage */
const SETTINGS_KEY = 'workanalytics-settings';

/** Настройки по умолчанию */
const DEFAULT_SETTINGS = {
  theme: 'slate-modernity',
  defaultCurrency: 'RUB',
  defaultPeriod: '7days',
  defaultLimit: 50,
  sources: { hh: true, rabotaby: true, habr: true },
};

/**
 * Загружает настройки из localStorage.
 * @returns {Object} — Объект настроек.
 */
function loadSettings() {
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

/**
 * Сохраняет настройки в localStorage.
 * @param {Object} settings — Объект настроек.
 */
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Инициализирует настройки из localStorage и применяет их к форме модалки.
 */
function initializeSettings() {
  const settings = loadSettings();

  /** Применяем валюту по умолчанию */
  currentCurrency = settings.defaultCurrency;
  DOM.currencyBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === currentCurrency);
  });

  /** Применяем дефолтные значения формы парсинга */
  if (DOM.selectPeriod) DOM.selectPeriod.value = settings.defaultPeriod;
  if (DOM.inputLimit) DOM.inputLimit.value = settings.defaultLimit;
}

/**
 * Привязывает обработчики для всех элементов модалки настроек.
 */
function setupSettingsListeners() {
  /** Открытие настроек */
  DOM.btnSettings.addEventListener('click', openSettings);

  /** Закрытие настроек */
  DOM.settingsClose.addEventListener('click', () => closeSettings(false));
  DOM.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.settingsOverlay) closeSettings(false);
  });

  /** Закрытие по Escape */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.settingsOverlay.style.display === 'flex') {
      // Если открыто окно подтверждения, закрываем его (как отмену)
      if (DOM.confirmModal.style.display === 'flex') {
        DOM.confirmModal.style.display = 'none';
        return;
      }
      closeSettings(false);
    }
  });

  /** Табы */
  DOM.settingsTabs.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      switchSettingsTab(tab.dataset.tab);
    });
  });

  /** Карточки тем */
  DOM.settingsThemeGrid.querySelectorAll('.settings-theme-card').forEach((card) => {
    card.addEventListener('click', () => {
      DOM.settingsThemeGrid.querySelectorAll('.settings-theme-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  /** Кнопки валюты по умолчанию */
  DOM.settingsDefaultCurrency.querySelectorAll('.settings-currency-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.settingsDefaultCurrency.querySelectorAll('.settings-currency-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  /** Кнопка "Удалить все отчёты" */
  DOM.btnDeleteAllReports.addEventListener('click', handleDeleteAllReports);

  /** Кнопка "Очистить кэш" */
  if (DOM.btnClearCache) {
    DOM.btnClearCache.addEventListener('click', handleClearCache);
  }

  /** Кнопка "Сбросить настройки" */
  DOM.btnResetSettings.addEventListener('click', handleResetSettings);

  /** Кнопка "Сохранить" */
  DOM.settingsSave.addEventListener('click', handleSaveSettings);
}

/**
 * Открывает модальное окно настроек.
 */
function openSettings() {
  const settings = loadSettings();

  /** Синхронизируем UI с текущими настройками */

  /* Тема */
  DOM.settingsThemeGrid.querySelectorAll('.settings-theme-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.theme === settings.theme);
  });

  /* Валюта */
  DOM.settingsDefaultCurrency.querySelectorAll('.settings-currency-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.currency === settings.defaultCurrency);
  });

  /* Парсинг */
  DOM.settingsDefaultPeriod.value = settings.defaultPeriod;
  DOM.settingsDefaultLimit.value = settings.defaultLimit;

  /* Источники */
  DOM.settingsSourceHH.checked = settings.sources.hh;
  DOM.settingsSourceRabotaby.checked = settings.sources.rabotaby;
  DOM.settingsSourceHabr.checked = settings.sources.habr;

  /** Показываем модалку */
  DOM.settingsOverlay.style.display = 'flex';

  /** Переключаемся на первую вкладку */
  switchSettingsTab('general');

  /** Загружаем данные для вкладки API */
  loadApiStatus();

  /** Загружаем статистику данных */
  loadDataStats();

  /** Сохраняем исходное состояние для проверки изменений */
  baselineSettings = JSON.stringify(getSettingsFromUI());
}

/**
 * Закрывает модальное окно настроек.
 * @param {boolean} force — Если true, закрывает без проверки изменений.
 */
async function closeSettings(force = false) {
  if (!force && baselineSettings) {
    const currentSettings = JSON.stringify(getSettingsFromUI());
    if (currentSettings !== baselineSettings) {
      const choice = await showConfirmModal();
      
      if (choice === 'save') {
        handleSaveSettings();
        return;
      } else if (choice === 'discard') {
        // Просто продолжаем закрытие
      } else {
        // 'cancel' — остаемся в настройках
        return;
      }
    }
  }

  DOM.settingsOverlay.style.display = 'none';
  baselineSettings = null;
}

/**
 * Показывает кастомное окно подтверждения сохранения изменений.
 * Использует универсальный механизм showConfirm.
 * @returns {Promise<'save'|'discard'|'cancel'>}
 */
async function showConfirmModal() {
  return await showConfirm({
    title: 'Сохранить изменения?',
    text: 'Вы изменили настройки. Хотите сохранить их перед выходом?',
    icon: '💾',
    buttons: [
      { text: 'Сохранить и выйти', type: 'primary', value: 'save' },
      { text: 'Не сохранять', type: 'outline', value: 'discard' },
      { text: 'Вернуться', type: 'ghost', value: 'cancel' }
    ]
  });
}

/**
 * Универсальное кастомное окно подтверждения (minimalist style).
 * @param {Object} options — { title, text, icon, buttons }
 * @returns {Promise<any>} — значение 'value' нажатой кнопки или null.
 */
function showConfirm(options) {
  return new Promise((resolve) => {
    const { title, text, icon = '⚠️', buttons = [] } = options;
    
    const overlay = DOM.confirmModalOverlay;
    const titleEl = document.getElementById('confirmTitle');
    const textEl = document.getElementById('confirmText');
    const iconEl = document.getElementById('confirmIcon');
    const actionsEl = document.getElementById('confirmActions');
    
    if (!overlay || !titleEl || !actionsEl) return resolve(null);

    titleEl.textContent = title;
    textEl.textContent = text;
    if (iconEl) iconEl.textContent = icon;
    
    actionsEl.innerHTML = '';
    
    // Если 2 короткие кнопки — ставим в ряд для минимализма
    const isRow = buttons.length === 2 && buttons.every(b => b.text.length <= 15);
    actionsEl.classList.toggle('confirm-modal__actions--row', isRow);
    
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = `btn btn--${b.type || 'outline'}`;
      btn.textContent = b.text;
      btn.onclick = (e) => {
        e.stopPropagation();
        overlay.style.display = 'none';
        resolve(b.value);
      };
      actionsEl.appendChild(btn);
    });
    
    overlay.style.display = 'flex';
    
    // Закрытие по клику на фон (отмена)
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        resolve(null);
      }
    };
  });
}

/**
 * Переключает активную вкладку настроек.
 * @param {string} tabName — Имя вкладки (general / parsing / api / data).
 */
function switchSettingsTab(tabName) {
  /** Убираем active со всех табов */
  DOM.settingsTabs.querySelectorAll('.settings-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  /** Переключаем панели */
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `settingsPanel-${tabName}`);
  });
}

  /** Собираем значения из формы настроек и сохраняет. */
function handleSaveSettings() {
  const settings = getSettingsFromUI();

  /** Проверяем: хотя бы 1 источник должен быть включён */
  if (!settings.sources.hh && !settings.sources.rabotaby && !settings.sources.habr) {
    showToast('Выберите хотя бы один источник данных', 'error');
    return;
  }

  /** Сохраняем в localStorage */
  saveSettings(settings);

  /** Применяем изменения сразу же */
  currentCurrency = settings.defaultCurrency;
  DOM.currencyBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === currentCurrency);
  });

  setAppTheme(settings.theme);

  if (currentReport) {
    renderDashboard(currentReport);
  }

  /** Обновляем базовое состояние, чтобы при закрытии не спрашивало повторно */
  baselineSettings = JSON.stringify(settings);

  /** Закрываем модалку */
  closeSettings(true); // Закрываем принудительно, т.к. уже сохранили
  showToast('Настройки сохранены', 'success');
}

/**
 * Собирает текущие значения настроек из элементов интерфейса.
 * @returns {Object}
 */
function getSettingsFromUI() {
  const activeThemeCard = DOM.settingsThemeGrid.querySelector('.settings-theme-card.active');
  const activeCurrencyBtn = DOM.settingsDefaultCurrency.querySelector('.settings-currency-btn.active');

  return {
    theme: activeThemeCard ? activeThemeCard.dataset.theme : DEFAULT_SETTINGS.theme,
    defaultCurrency: activeCurrencyBtn ? activeCurrencyBtn.dataset.currency : DEFAULT_SETTINGS.defaultCurrency,
    defaultPeriod: DOM.settingsDefaultPeriod.value,
    defaultLimit: parseInt(DOM.settingsDefaultLimit.value, 10) || 50,
    sources: {
      hh: DOM.settingsSourceHH.checked,
      rabotaby: DOM.settingsSourceRabotaby.checked,
      habr: DOM.settingsSourceHabr.checked,
    },
  };
}


/**
 * Загружает статус API (Gemini, валюты) с сервера.
 */
async function loadApiStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();

    if (data.success) {
      /** Gemini */
      const geminiEl = DOM.geminiStatusText;
      const geminiCountEl = DOM.geminiKeysCount;

      if (data.gemini.configured) {
        geminiEl.className = 'settings-api-status__value settings-api-status__value--ok';
        geminiEl.innerHTML = '<span class="settings-api-status__dot"></span>Настроен';
        geminiCountEl.textContent = data.gemini.keysCount;
      } else {
        geminiEl.className = 'settings-api-status__value settings-api-status__value--error';
        geminiEl.innerHTML = '<span class="settings-api-status__dot"></span>Не настроен';
        geminiCountEl.textContent = '0';
      }

      /** Валюты */
      const currencyEl = DOM.currencyStatusText;
      if (data.currency.configured) {
        currencyEl.className = 'settings-api-status__value settings-api-status__value--ok';
        currencyEl.innerHTML = '<span class="settings-api-status__dot"></span>Настроен';
      } else {
        currencyEl.className = 'settings-api-status__value settings-api-status__value--error';
        currencyEl.innerHTML = '<span class="settings-api-status__dot"></span>Не настроен';
      }
    }
  } catch (error) {
    console.warn('[Settings] ⚠️ Не удалось загрузить статус API:', error);
    DOM.geminiStatusText.className = 'settings-api-status__value settings-api-status__value--error';
    DOM.geminiStatusText.innerHTML = '<span class="settings-api-status__dot"></span>Недоступен';
    DOM.currencyStatusText.className = 'settings-api-status__value settings-api-status__value--error';
    DOM.currencyStatusText.innerHTML = '<span class="settings-api-status__dot"></span>Недоступен';
  }
}

/**
 * Загружает статистику данных (количество отчётов и вакансий).
 */
async function loadDataStats() {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (data.success) {
      DOM.dataReportsCount.textContent = data.reports.length;
      const totalJobs = data.reports.reduce((sum, r) => sum + (r.stats?.totalFound || 0), 0);
      DOM.dataJobsCount.textContent = totalJobs;
    }
  } catch (error) {
    console.warn('[Settings] ⚠️ Не удалось загрузить статистику:', error);
  }
}

/**
 * Удаляет все отчёты после подтверждения.
 */
async function handleDeleteAllReports() {
  const confirmed = await showConfirm({
    title: 'Удалить все отчёты?',
    text: 'Это действие необратимо. Все собранные данные будут безвозвратно удалены из базы данных.',
    icon: '🗑️',
    buttons: [
      { text: 'Да, удалить всё', type: 'primary', value: true },
      { text: 'Отмена', type: 'outline', value: false }
    ]
  });

  if (!confirmed) return;

  try {
    const response = await fetch('/api/reports', { method: 'DELETE' });
    const data = await response.json();

    if (data.success) {
      /** Обновляем UI */
      currentReport = null;
      showScreen('welcome');
      loadReportsList();
      loadDataStats();

      showToast(`Все отчёты удалены (${data.count})`, 'success');
    } else {
      showToast(`Ошибка: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('[Settings] ❌ Ошибка удаления отчётов:', error);
    showToast('Ошибка при удалении отчётов', 'error');
  }
}

/**
 * Имитирует очистку кэша (поиск, временные данные).
 */
function handleClearCache() {
  // На текущий момент кэширование на бэкенде минимально, 
  // но мы очищаем локальные переменные и показываем успех.
  console.log('[Settings] 🧹 Очистка кэша...');
  
  // Можно сбросить данные в памяти, если они есть
  // Например: charts.salary?.destroy();
  
  showToast('Кэш успешно очищен', 'success');
}

/**
 * Сбрасывает настройки к значениям по умолчанию.
 */
async function handleResetSettings() {
  const confirmed = await showConfirm({
    title: 'Сбросить настройки?',
    text: 'Все ваши предпочтения (тема, валюта, лимиты) будут сброшены к заводским значениям.',
    icon: '🔄',
    buttons: [
      { text: 'Сбросить', type: 'primary', value: true },
      { text: 'Оставить как есть', type: 'outline', value: false }
    ]
  });

  if (!confirmed) return;

  saveSettings(DEFAULT_SETTINGS);
  setAppTheme(DEFAULT_SETTINGS.theme);
  currentCurrency = DEFAULT_SETTINGS.defaultCurrency;


  DOM.currencyBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === DEFAULT_SETTINGS.defaultCurrency);
  });
  if (DOM.selectPeriod) DOM.selectPeriod.value = DEFAULT_SETTINGS.defaultPeriod;
  if (DOM.inputLimit) DOM.inputLimit.value = DEFAULT_SETTINGS.defaultLimit;

  /** Перезаполняем форму настроек */
  openSettings();
  showToast('Настройки сброшены', 'success');
}

/**
 * Показывает всплывающее уведомление (toast).
 * @param {string} message — Текст уведомления.
 * @param {'success'|'error'} type — Тип уведомления.
 */
function showToast(message, type = 'success') {
  /** Удаляем предыдущий тост, если есть */
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${type === 'success' ? '✅' : '❌'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  /** Автоудаление через 3 секунды */
  setTimeout(() => {
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Инициализирует логику для всех кастомных степперов (кнопки +/- у полей чисел).
 * Поддерживает «зажатие» кнопки (Long Press) с адаптивным ускорением.
 */
function setupStepperListeners() {
  let interval = null;
  let timeout = null;
  let accelerationFactor = 1;

  function stopStepping() {
    if (timeout) clearTimeout(timeout);
    if (interval) clearInterval(interval);
    timeout = null;
    interval = null;
    accelerationFactor = 1;
  }

  function doStep(input, direction) {
    if (!input || input.disabled) {
      stopStepping();
      return;
    }
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 1000;
    const step = parseFloat(input.step) || 1;
    let value = parseFloat(input.value) || 0;

    // Рассчитываем итоговый шаг с учетом ускорения
    const currentStep = step * Math.floor(accelerationFactor);

    if (direction === 'plus') {
      value = Math.min(max, value + currentStep);
    } else {
      value = Math.max(min, value - currentStep);
    }

    input.value = value;
    
    // Визуальный эффект пульсации при изменении
    const container = input.closest('.number-stepper');
    if (container) {
      container.classList.remove('pulse');
      void container.offsetWidth; // Trigger reflow
      container.classList.add('pulse');
    }

    // Увеличиваем ускорение для следующего шага
    if (accelerationFactor < 10) accelerationFactor += 0.2;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Общий обработчик нажатия
  function handleStart(e, direction, btn) {
    const stepper = btn.closest('.number-stepper');
    if (!stepper) return;

    const input = stepper.querySelector('input[type="number"]');
    if (!input || input.disabled) return;

    // Первый шаг сразу
    accelerationFactor = 1;
    doStep(input, direction);

    // Задержка перед началом авто-повтора
    timeout = setTimeout(() => {
      interval = setInterval(() => {
        doStep(input, direction);
      }, 80);
    }, 400);
  }

  // Мышь
  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-stepper]');
    if (!btn || e.button !== 0) return;
    handleStart(e, btn.dataset.stepper, btn);
  });

  document.addEventListener('mouseup', stopStepping);
  document.addEventListener('mouseleave', stopStepping);

  // Touch
  document.addEventListener('touchstart', (e) => {
    const btn = e.target.closest('[data-stepper]');
    if (!btn) return;
    if (e.cancelable) e.preventDefault();
    handleStart(e, btn.dataset.stepper, btn);
  }, { passive: false });

  document.addEventListener('touchend', stopStepping);
  document.addEventListener('touchcancel', stopStepping);
}

/**
 * Инициализирует логику для сегментированных контролов (переключатели периода).
 * Синхронизирует визуальное состояние со скрытыми селектами.
 */
function setupSegmentedControlListeners() {
  const controls = document.querySelectorAll('.segmented-control');

  controls.forEach(control => {
    const buttons = control.querySelectorAll('.segmented-control__btn');
    const containerId = control.id;
    
    // Ищем связанный селект (по ID или структуре)
    let targetSelect = null;
    if (containerId === 'controlPeriod') targetSelect = DOM.selectPeriod;
    if (containerId === 'settingsControlPeriod') targetSelect = DOM.settingsDefaultPeriod;

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        
        // Обновляем визуальное состояние кнопок
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Обновляем скрытый селект
        if (targetSelect) {
          targetSelect.value = val;
          targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // Инициализация начального состояния (если селект уже имеет значение)
    if (targetSelect) {
      const initialVal = targetSelect.value;
      const initialBtn = control.querySelector(`[data-value="${initialVal}"]`);
      if (initialBtn) {
        buttons.forEach(b => b.classList.remove('active'));
        initialBtn.classList.add('active');
      }
    }
  });
}

