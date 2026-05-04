/**
 * @file charts.js — Модуль визуализации данных дашборда (Chart.js).
 * @description Рендерит 6 основных графиков + динамику:
 *   1. Распределение зарплат (гистограмма)
 *   2. Топ-15 Hard Skills (горизонтальный bar)
 *   3. Зарплата vs Опыт (bar)
 *   4. Формат работы и ЗП (combo: doughnut + bar)
 *   5. Влияние английского на ЗП (bar)
 *   6. Категории специалистов (pie)
 *   7. Динамика зарплаты (line)
 */

import { charts } from '../state.js';

// ────────────────────────────────────────────────
//  УТИЛИТЫ
// ────────────────────────────────────────────────

/** Палитра цветов для графиков */
const PALETTE = [
  'rgba(99, 102, 241, 0.85)',   // indigo
  'rgba(236, 72, 153, 0.85)',   // pink
  'rgba(14, 165, 233, 0.85)',   // sky
  'rgba(34, 197, 94, 0.85)',    // green
  'rgba(249, 115, 22, 0.85)',   // orange
  'rgba(168, 85, 247, 0.85)',   // purple
  'rgba(20, 184, 166, 0.85)',   // teal
  'rgba(234, 179, 8, 0.85)',    // yellow
  'rgba(239, 68, 68, 0.85)',    // red
  'rgba(59, 130, 246, 0.85)',   // blue
  'rgba(217, 70, 239, 0.85)',   // fuchsia
  'rgba(132, 204, 22, 0.85)',   // lime
  'rgba(244, 63, 94, 0.85)',    // rose
  'rgba(6, 182, 212, 0.85)',    // cyan
  'rgba(251, 146, 60, 0.85)',   // amber
];

/**
 * Фильтрует значения "Не указано", null, undefined из данных.
 * @param {Array} jobs
 * @param {string} field — Имя поля.
 * @returns {Array}
 */
function filterValid(jobs, field) {
  return jobs.filter(j => {
    const v = j[field];
    return v && v !== 'Не указано' && v !== 'null' && v !== 'undefined';
  });
}

/**
 * Считает среднюю ЗП для группы вакансий.
 * @param {Array} jobs
 * @param {Object} rates — Курсы валют.
 * @param {string} currency — Целевая валюта.
 * @returns {number}
 */
function avgSalary(jobs, rates, currency) {
  const withSalary = jobs.filter(j => j.salary && (j.salary.min || j.salary.max));
  if (withSalary.length === 0) return 0;

  let sum = 0;
  for (const j of withSalary) {
    const avg = j.salary.min && j.salary.max
      ? (j.salary.min + j.salary.max) / 2
      : (j.salary.min || j.salary.max);
    sum += convertSalary(avg, j.salary.currency, currency, rates);
  }
  return Math.round(sum / withSalary.length);
}

/**
 * Конвертирует зарплату между валютами.
 */
function convertSalary(amount, from, to, rates) {
  if (!rates || from === to) return amount;
  const fromRate = rates[from] || 1;
  const toRate = rates[to] || 1;
  return amount / fromRate * toRate;
}

/**
 * Уничтожает старый инстанс Chart и создаёт новый.
 */
function safeCreateChart(chartKey, canvasId, config) {
  if (charts[chartKey]) {
    charts[chartKey].destroy();
    charts[chartKey] = null;
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  charts[chartKey] = new Chart(ctx, config);
  return charts[chartKey];
}

/**
 * Скрывает или показывает родительскую карточку графика.
 */
function toggleChartCardVisibility(canvasId, show) {
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    const card = canvas.closest('.chart-card');
    if (card) {
      card.style.display = show ? '' : 'none';
    }
  }
}

/**
 * Маппит сырой опыт парсеров (например, "От 1 года до 3 лет") в стандартные грейды.
 */
function mapExperienceToLevel(exp) {
  if (!exp) return null;
  const l = exp.toLowerCase();
  if (['intern', 'junior', 'middle', 'senior', 'lead'].includes(exp)) return exp;
  if (l.includes('нет опыта')) return 'Junior'; // Intern/Junior
  if (l.includes('от 1 года') || l.includes('1-3')) return 'Middle'; // Обычно 1-3 года это Middle
  if (l.includes('от 3 до 6') || l.includes('3-6')) return 'Senior';
  if (l.includes('более 6')) return 'Lead';
  return null;
}

/**
 * Общие опции для графиков.
 */
function commonOptions(opts = {}) {
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#94a3b8';
  const gridColor = 'rgba(148, 163, 184, 0.08)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        display: opts.legend !== false,
        position: opts.legendPosition || 'top',
        labels: { color: textColor, font: { family: "'Inter', sans-serif", size: 11, weight: 500 }, padding: 12, usePointStyle: true, pointStyle: 'circle' },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { family: "'Inter', sans-serif", weight: 600, size: 13 },
        bodyFont: { family: "'Inter', sans-serif", size: 12 },
        padding: 12,
        cornerRadius: 8,
        borderColor: 'rgba(148, 163, 184, 0.15)',
        borderWidth: 1,
      },
    },
    scales: opts.noScales ? undefined : {
      x: {
        ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 11 } },
        grid: { color: gridColor },
      },
      y: {
        ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 11 } },
        grid: { color: gridColor },
      },
    },
    ...opts.extra,
  };
}

/**
 * Форматирует число с разделителями тысяч.
 */
function formatNumber(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('ru-RU');
}

// ────────────────────────────────────────────────
//  ГРАФИКИ
// ────────────────────────────────────────────────

/**
 * 1. Распределение зарплат (гистограмма).
 */
export function renderChartSalary(jobs, rates, currency) {
  const withSalary = jobs.filter(j => j.salary && (j.salary.min || j.salary.max));
  if (withSalary.length === 0) {
    toggleChartCardVisibility('chartSalary', false);
    return;
  }
  toggleChartCardVisibility('chartSalary', true);

  const salaries = withSalary.map(j => {
    const avg = j.salary.min && j.salary.max ? (j.salary.min + j.salary.max) / 2 : (j.salary.min || j.salary.max);
    return convertSalary(avg, j.salary.currency, currency, rates);
  }).sort((a, b) => a - b);

  // Автоматическое определение бинов
  const min = salaries[0];
  const max = salaries[salaries.length - 1];
  const binCount = Math.min(15, Math.max(5, Math.ceil(Math.sqrt(salaries.length))));
  const binSize = Math.ceil((max - min) / binCount / 10000) * 10000 || 50000;

  const bins = {};
  for (const s of salaries) {
    const binStart = Math.floor(s / binSize) * binSize;
    const label = `${formatNumber(binStart / 1000)}k`;
    bins[label] = (bins[label] || 0) + 1;
  }

  safeCreateChart('salary', 'chartSalary', {
    type: 'bar',
    data: {
      labels: Object.keys(bins),
      datasets: [{
        label: 'Количество вакансий',
        data: Object.values(bins),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: commonOptions({ legend: false }),
  });
}

/**
 * 2. Топ-15 Hard Skills (горизонтальный bar).
 */
export function renderChartSkills(jobs) {
  const skillCount = {};
  for (const job of jobs) {
    const skills = job.skills || [];
    for (const skill of skills) {
      const normalized = skill.trim();
      if (normalized) skillCount[normalized] = (skillCount[normalized] || 0) + 1;
    }
  }

  const sorted = Object.entries(skillCount).sort((a, b) => b[1] - a[1]).slice(0, 30); // Берем топ 30 для облака
  if (sorted.length === 0) {
    toggleChartCardVisibility('chartSkills', false);
    return;
  }
  toggleChartCardVisibility('chartSkills', true);

  // Используем wordCloud, так как библиотека подключена в index.html
  safeCreateChart('skills', 'chartSkills', {
    type: 'wordCloud',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Упоминаний',
        data: sorted.map(e => e[1] * 10), // Увеличиваем вес для размера
        color: PALETTE.slice(0, sorted.length),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw / 10} упоминаний`,
          }
        }
      }
    }
  });
}

/**
 * 3. Зарплата vs Опыт (bar).
 * Группирует по experience, считает среднюю ЗП. Исключает "Не указано".
 */
export function renderChartSalaryVsExperience(jobs, rates, currency) {
  const levels = ['Junior', 'Middle', 'Senior', 'Lead'];
  
  // Добавляем нормализованный опыт каждому джобу для агрегации
  const normalizedJobs = jobs.map(j => ({ ...j, mappedExp: mapExperienceToLevel(j.experience) }));
  const valid = normalizedJobs.filter(j => j.mappedExp);

  const data = levels.map(level => {
    const group = valid.filter(j => j.mappedExp === level);
    return avgSalary(group, rates, currency);
  }).map(v => v || 0);

  // Если все нули — не рендерим
  if (data.every(v => v === 0)) {
    toggleChartCardVisibility('chartSalaryVsExp', false);
    return;
  }
  toggleChartCardVisibility('chartSalaryVsExp', true);

  const colors = [
    'rgba(34, 197, 94, 0.8)',    // Intern - green
    'rgba(14, 165, 233, 0.8)',   // Junior - sky
    'rgba(99, 102, 241, 0.8)',   // Middle - indigo
    'rgba(236, 72, 153, 0.8)',   // Senior - pink
    'rgba(249, 115, 22, 0.8)',   // Lead - orange
  ];

  safeCreateChart('salaryVsExp', 'chartSalaryVsExp', {
    type: 'bar',
    data: {
      labels: levels,
      datasets: [{
        label: `Средняя ЗП (${currency})`,
        data,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: commonOptions({
      legend: false,
      extra: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatNumber(ctx.raw)} ${currency}`,
            },
          },
        },
      },
    }),
  });
}

/**
 * 4a. Формат работы — Doughnut (доля Remote/Office/Hybrid).
 */
export function renderChartWorkFormatDoughnut(jobs) {
  const valid = filterValid(jobs, 'workFormat');
  if (valid.length === 0) {
    toggleChartCardVisibility('chartWorkFormatDoughnut', false);
    return;
  }
  toggleChartCardVisibility('chartWorkFormatDoughnut', true);

  const counts = {};
  for (const j of valid) {
    counts[j.workFormat] = (counts[j.workFormat] || 0) + 1;
  }

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  const colorMap = {
    'Remote': 'rgba(34, 197, 94, 0.85)',
    'Office': 'rgba(99, 102, 241, 0.85)',
    'Hybrid': 'rgba(249, 115, 22, 0.85)',
  };

  safeCreateChart('workFormatDoughnut', 'chartWorkFormatDoughnut', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => colorMap[l] || 'rgba(148, 163, 184, 0.5)'),
        borderWidth: 0,
        spacing: 2,
      }],
    },
    options: commonOptions({
      noScales: true,
      legendPosition: 'bottom',
      extra: {
        cutout: '60%',
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    }),
  });
}

/**
 * 4b. Формат работы — Bar (средняя ЗП по формату).
 */
export function renderChartWorkFormatBar(jobs, rates, currency) {
  const formats = ['Remote', 'Office', 'Hybrid'];
  const valid = filterValid(jobs, 'workFormat');

  const data = formats.map(f => {
    const group = valid.filter(j => j.workFormat === f);
    return avgSalary(group, rates, currency);
  });

  if (data.every(v => v === 0)) {
    toggleChartCardVisibility('chartWorkFormatBar', false);
    return;
  }
  toggleChartCardVisibility('chartWorkFormatBar', true);

  const colorMap = {
    'Remote': 'rgba(34, 197, 94, 0.8)',
    'Office': 'rgba(99, 102, 241, 0.8)',
    'Hybrid': 'rgba(249, 115, 22, 0.8)',
  };

  safeCreateChart('workFormatBar', 'chartWorkFormatBar', {
    type: 'bar',
    data: {
      labels: formats,
      datasets: [{
        label: `Ср. ЗП (${currency})`,
        data,
        backgroundColor: formats.map(f => colorMap[f]),
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: commonOptions({
      legend: false,
      extra: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatNumber(ctx.raw)} ${currency}`,
            },
          },
        },
      },
    }),
  });
}

/**
 * 5. Влияние английского на ЗП (bar).
 */
export function renderChartEnglishSalary(jobs, rates, currency) {
  const levels = ['Нет', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const valid = filterValid(jobs, 'englishLevel');

  const data = levels.map(level => {
    const group = valid.filter(j => j.englishLevel === level);
    return avgSalary(group, rates, currency);
  });

  // Показываем только уровни с данными
  const filteredLabels = [];
  const filteredData = [];
  levels.forEach((l, i) => {
    if (data[i] > 0) {
      filteredLabels.push(l);
      filteredData.push(data[i]);
    }
  });

  if (filteredData.length === 0) {
    toggleChartCardVisibility('chartEnglishSalary', false);
    return;
  }
  toggleChartCardVisibility('chartEnglishSalary', true);

  // Градиент от зелёного к фиолетовому
  const gradientColors = filteredLabels.map((_, i) => {
    const t = i / Math.max(filteredLabels.length - 1, 1);
    const r = Math.round(34 + (168 - 34) * t);
    const g = Math.round(197 + (85 - 197) * t);
    const b = Math.round(94 + (247 - 94) * t);
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  });

  safeCreateChart('englishSalary', 'chartEnglishSalary', {
    type: 'bar',
    data: {
      labels: filteredLabels,
      datasets: [{
        label: `Ср. ЗП (${currency})`,
        data: filteredData,
        backgroundColor: gradientColors,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: commonOptions({
      legend: false,
      extra: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatNumber(ctx.raw)} ${currency}`,
            },
          },
        },
      },
    }),
  });
}

/**
 * 6. Категории специалистов (pie).
 */
export function renderChartTechCategory(jobs) {
  const valid = filterValid(jobs, 'techCategory');
  if (valid.length === 0 || valid.every(j => j.techCategory === 'Другое')) {
    toggleChartCardVisibility('chartTechCategory', false);
    return;
  }
  toggleChartCardVisibility('chartTechCategory', true);

  const counts = {};
  for (const j of valid) {
    counts[j.techCategory] = (counts[j.techCategory] || 0) + 1;
  }

  // Убираем "Другое" если слишком мало
  const labels = Object.keys(counts);
  const data = Object.values(counts);

  safeCreateChart('techCategory', 'chartTechCategory', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 0,
        spacing: 2,
      }],
    },
    options: commonOptions({
      noScales: true,
      legendPosition: 'right',
      extra: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    }),
  });
}

/**
 * 7. Динамика зарплаты (line) — по отчётам за одинаковый query.
 */
export function renderChartDynamics(reports, currency, rates) {
  const select = document.getElementById('dynamicsQuerySelect');
  if (!select || !reports || reports.length === 0) {
    toggleChartCardVisibility('chartDynamics', false);
    return;
  }
  toggleChartCardVisibility('chartDynamics', true);

  // Получаем уникальные запросы
  const queries = [...new Set(reports.map(r => r.query))].filter(Boolean);
  
  // Заполняем селект
  select.innerHTML = '<option value="">Выберите запрос...</option>';
  queries.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q;
    opt.textContent = q;
    select.appendChild(opt);
  });

  // Обработчик выбора
  select.onchange = () => {
    const query = select.value;
    if (!query) return;

    const filtered = reports
      .filter(r => r.query === query && r.stats?.avgSalaryNormalized)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (filtered.length < 2) return;

    const labels = filtered.map(r => {
      const d = new Date(r.createdAt);
      return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    const data = filtered.map(r => {
      const avg = r.stats.avgSalaryNormalized || 0;
      return rates ? convertSalary(avg, 'RUB', currency, rates) : avg;
    });

    safeCreateChart('dynamics', 'chartDynamics', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `Ср. ЗП "${query}" (${currency})`,
          data,
          borderColor: 'rgba(99, 102, 241, 1)',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        }],
      },
      options: commonOptions({
        extra: {
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${formatNumber(ctx.raw)} ${currency}`,
              },
            },
          },
        },
      }),
    });
  };

  // Авто-выбор первого запроса если есть
  if (queries.length > 0) {
    select.value = queries[0];
    select.dispatchEvent(new Event('change'));
  }
}

/**
 * Уничтожает все активные графики.
 */
export function destroyAllCharts() {
  for (const key of Object.keys(charts)) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }
}
