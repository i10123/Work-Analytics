/**
 * charts.js
 * Суть: Модуль визуализации данных с помощью библиотеки Chart.js.
 * Что делает: Генерирует различные графики на основе данных о вакансиях (зарплаты, навыки, опыт, форматы работы).
 * Что содержит: Конфигурации цветов, общие настройки графиков, функции рендеринга конкретных диаграмм (столбчатые, круговые) и очистки графиков.
 */
import { charts } from '../state.js';
import { convertCurrency } from '../utils/currency.js';

const PALETTE = [
  'rgba(99, 102, 241, 0.85)',
  'rgba(236, 72, 153, 0.85)',
  'rgba(14, 165, 233, 0.85)',
  'rgba(34, 197, 94, 0.85)',
  'rgba(249, 115, 22, 0.85)',
  'rgba(168, 85, 247, 0.85)',
  'rgba(20, 184, 166, 0.85)',
  'rgba(234, 179, 8, 0.85)',
  'rgba(239, 68, 68, 0.85)',
  'rgba(59, 130, 246, 0.85)',
  'rgba(217, 70, 239, 0.85)',
  'rgba(132, 204, 22, 0.85)',
  'rgba(244, 63, 94, 0.85)',
  'rgba(6, 182, 212, 0.85)',
  'rgba(251, 146, 60, 0.85)',
];

function filterValid(jobs, field) {
  return jobs.filter(j => {
    const v = j[field];
    return v && v !== 'Не указано' && v !== 'null' && v !== 'undefined';
  });
}

function avgSalary(jobs, rates, currency) {
  const withSalary = jobs.filter(j => j.salary && (j.salary.min > 0 || j.salary.max > 0));
  if (withSalary.length === 0) return 0;

  let sum = 0;
  for (const j of withSalary) {
    const avg = j.salary.min && j.salary.max
      ? (j.salary.min + j.salary.max) / 2
      : (j.salary.min || j.salary.max);
    sum += convertCurrency(avg, j.salary.currency, currency, rates);
  }
  return Math.round(sum / withSalary.length);
}

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

function toggleChartCardVisibility(canvasId, show) {
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    const card = canvas.closest('.chart-card');
    if (card) {
      card.style.display = show ? '' : 'none';
    }
  }
}

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

let currentTextColor = null;

export function updateChartColors() {
  currentTextColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#94a3b8';
}

function commonOptions(opts = {}) {
  if (!currentTextColor) {
    updateChartColors();
  }
  const textColor = currentTextColor;
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

function formatNumber(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('ru-RU');
}

export function renderChartSalary(jobs, rates, currency) {
  const withSalary = jobs.filter(j => j.salary && (j.salary.min > 0 || j.salary.max > 0));
  if (withSalary.length === 0) {
    toggleChartCardVisibility('chartSalary', false);
    return;
  }
  toggleChartCardVisibility('chartSalary', true);

  const salaries = withSalary.map(j => {
    const avg = j.salary.min && j.salary.max ? (j.salary.min + j.salary.max) / 2 : (j.salary.min || j.salary.max);
    return convertCurrency(avg, j.salary.currency, currency, rates);
  }).filter(s => s > 0).sort((a, b) => a - b);

  if (salaries.length === 0) {
    toggleChartCardVisibility('chartSalary', false);
    return;
  }

  const min = salaries[0];
  const max = salaries[salaries.length - 1];
  const binCount = Math.min(15, Math.max(5, Math.ceil(Math.sqrt(salaries.length))));
  const binSize = Math.ceil((max - min) / binCount / 1000) * 1000 || 5000;

  const bins = {};
  for (const s of salaries) {
    const binStart = Math.floor(s / binSize) * binSize;
    const label = `${formatNumber(binStart)}`;
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

export function renderChartSkills(jobs) {
  const skillCount = {};
  for (const job of jobs) {
    const skills = job.skills || [];
    for (const skill of skills) {
      const normalized = skill.trim();
      if (normalized) skillCount[normalized] = (skillCount[normalized] || 0) + 1;
    }
  }

  const sorted = Object.entries(skillCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (sorted.length === 0) {
    toggleChartCardVisibility('chartSkills', false);
    return;
  }
  toggleChartCardVisibility('chartSkills', true);

  safeCreateChart('skills', 'chartSkills', {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Упоминаний',
        data: sorted.map(e => e[1]),
        backgroundColor: PALETTE.slice(0, sorted.length),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 20,
      }],
    },
    options: commonOptions({
      legend: false,
      extra: {
        indexAxis: 'y',
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw} упоминаний`,
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { display: false },
            ticks: { precision: 0 }
          },
          y: {
            grid: { display: false },
            ticks: {
              autoSkip: false,
              font: {
                size: 12,
                weight: '600'
              },
              padding: 10
            }
          }
        }
      }
    })
  });
}

export function renderChartSalaryVsExperience(jobs, rates, currency) {
  const levels = ['Junior', 'Middle', 'Senior', 'Lead'];

  const normalizedJobs = jobs.map(j => ({ ...j, mappedExp: mapExperienceToLevel(j.experience) }));
  const valid = normalizedJobs.filter(j => j.mappedExp);

  const data = levels.map(level => {
    const group = valid.filter(j => j.mappedExp === level);
    return avgSalary(group, rates, currency);
  }).map(v => v || 0);

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

export function renderChartExperienceScatter(jobs, rates, currency) {
  const validJobs = jobs.filter(j => 
    j.salary && (j.salary.min > 0 || j.salary.max > 0) &&
    (typeof j.experience_years_min === 'number' || typeof j.experience_years_max === 'number')
  );

  if (validJobs.length === 0) {
    toggleChartCardVisibility('chartExperienceScatter', false);
    return;
  }
  toggleChartCardVisibility('chartExperienceScatter', true);

  const data = validJobs.map(j => {
    const avgSalaryObj = j.salary.min && j.salary.max ? (j.salary.min + j.salary.max) / 2 : (j.salary.min || j.salary.max);
    const y = convertCurrency(avgSalaryObj, j.salary.currency, currency, rates);
    const x = typeof j.experience_years_min === 'number' ? j.experience_years_min : j.experience_years_max;
    return { x, y, job: j };
  });

  safeCreateChart('experienceScatter', 'chartExperienceScatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: `Зарплата (${currency}) от опыта`,
        data: data,
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: 'rgba(99, 102, 241, 1)',
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: commonOptions({
      legend: false,
      extra: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const pt = ctx.raw;
                return `${pt.job.title}: ${pt.x} лет -> ${formatNumber(pt.y)} ${currency}`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Опыт (годы)' }
          },
          y: {
            title: { display: true, text: `Зарплата (${currency})` }
          }
        }
      }
    })
  });
}

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

export function renderChartEnglishSalary(jobs, rates, currency) {
  const levels = ['Нет', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const valid = filterValid(jobs, 'englishLevel');

  const data = levels.map(level => {
    const group = valid.filter(j => j.englishLevel === level);
    return avgSalary(group, rates, currency);
  });

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

export function destroyAllCharts() {
  for (const key of Object.keys(charts)) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }
}
