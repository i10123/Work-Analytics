// Модуль визуализации аналитических данных о вакансиях с использованием Chart.js.

import { charts } from '../state.js';
import { convertCurrency } from '../utils/currency.js';

const PALETTE = [
  'rgba(99, 102, 241, 0.85)', // Indigo
  'rgba(236, 72, 153, 0.85)', // Pink
  'rgba(14, 165, 233, 0.85)', // Sky
  'rgba(34, 197, 94, 0.85)',  // Green
  'rgba(249, 115, 22, 0.85)',  // Orange
  'rgba(168, 85, 247, 0.85)', // Purple
  'rgba(20, 184, 166, 0.85)',  // Teal
  'rgba(234, 179, 8, 0.85)',   // Yellow
  'rgba(239, 68, 68, 0.85)',   // Red
  'rgba(59, 130, 246, 0.85)',  // Blue
  'rgba(217, 70, 239, 0.85)', // Fuchsia
  'rgba(132, 204, 22, 0.85)', // Lime
  'rgba(244, 63, 94, 0.85)',  // Rose
  'rgba(6, 182, 212, 0.85)',  // Cyan
  'rgba(251, 146, 60, 0.85)', // Amber
];

// Фильтрует вакансии, исключая записи с невалидными или незаполненными значениями в указанном поле.
function filterValid(jobs, field) {
  return jobs.filter(j => {
    const v = j[field];
    return v && v !== 'Не указано' && v !== 'null' && v !== 'undefined';
  });
}

// Вычисляет среднюю зарплату для переданного списка вакансий с конвертацией валют.
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

// Создание или обновление существующего экземпляра графика Chart.js
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
  if (l.includes('нет опыта') || l.includes('junior')) return 'Junior';
  if (l.includes('от 1 года') || l.includes('1-3') || l.includes('middle')) return 'Middle';
  if (l.includes('от 3 до 6') || l.includes('3-6') || l.includes('senior')) return 'Senior';
  if (l.includes('более 6') || l.includes('lead')) return 'Lead';
  return null;
}

let currentTextColor = null;

// Обновление основных цветов текста графиков в соответствии с темой оформления
export function updateChartColors() {
  currentTextColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#94a3b8';
}

// генерирует общий набор опций для диаграмм Chart.js (адаптивность, анимации, стили легенды и тултипов, сетки).
function commonOptions(opts = {}) {
  if (!currentTextColor) {
    updateChartColors();
  }
  const textColor = currentTextColor;
  const gridColor = 'rgba(148, 163, 184, 0.05)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 150,
    animation: { duration: 800, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        display: opts.legend !== false,
        position: opts.legendPosition || 'top',
        labels: {
          color: textColor,
          font: { family: "'Outfit', 'Inter', sans-serif", size: 11, weight: 600 },
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle'
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: '#ffffff',
        titleFont: { family: "'Outfit', 'Inter', sans-serif", weight: 700, size: 12 },
        bodyFont: { family: "'Inter', sans-serif", size: 11 },
        padding: 10,
        cornerRadius: 8,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        usePointStyle: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
      },
    },
    scales: opts.noScales ? undefined : {
      x: {
        ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 10, weight: 500 } },
        grid: { color: gridColor, drawBorder: false },
      },
      y: {
        ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 10, weight: 500 } },
        grid: { color: gridColor, drawBorder: false },
      },
    },
    ...opts.extra,
  };
}

function formatNumber(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('ru-RU');
}

function formatBinLabel(start, size) {
  const end = start + size;
  const formatVal = (val) => {
    if (val === 0) return '0';
    if (val >= 1000) {
      const thousands = val / 1000;
      if (Number.isInteger(thousands)) {
        return `${thousands}к`;
      }
      return `${(val / 1000).toFixed(1)}к`;
    }
    return val.toString();
  };
  return `${formatVal(start)} — ${formatVal(end)}`;
}

// Отрисовка графика диапазонов (вилки) зарплат и средней зарплаты по грейдам
export function renderChartSalaryGradeRange(jobs, rates, currency) {
  const canvas = document.getElementById('chartSalaryGradeRange');
  if (!canvas) return;

  const levels = ['Junior', 'Middle', 'Senior', 'Lead'];
  const normalizedJobs = jobs.map(j => ({ ...j, mappedExp: mapExperienceToLevel(j.experience) }));
  const validJobs = normalizedJobs.filter(j => j.mappedExp && j.salary && (j.salary.min > 0 || j.salary.max > 0));

  const dataRanges = [];
  const dataAverages = [];

  for (const lvl of levels) {
    const group = validJobs.filter(j => j.mappedExp === lvl);
    if (group.length === 0) {
      dataRanges.push([0, 0]);
      dataAverages.push(0);
      continue;
    }

    const convertedSalaries = group.map(j => {
      const min = j.salary.min || j.salary.max;
      const max = j.salary.max || j.salary.min;
      return {
        min: convertCurrency(min, j.salary.currency, currency, rates),
        max: convertCurrency(max, j.salary.currency, currency, rates)
      };
    });

    const minSal = Math.min(...convertedSalaries.map(s => s.min));
    const maxSal = Math.max(...convertedSalaries.map(s => s.max));
    const avgSalVal = avgSalary(group, rates, currency);

    dataRanges.push([minSal, maxSal]);
    dataAverages.push(avgSalVal);
  }

  if (dataRanges.every(r => r[0] === 0 && r[1] === 0)) {
    toggleChartCardVisibility('chartSalaryGradeRange', false);
    return;
  }
  toggleChartCardVisibility('chartSalaryGradeRange', true);

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(124, 58, 237, 0.85)'); // Purple
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.4)');  // Indigo

  safeCreateChart('salaryGradeRange', 'chartSalaryGradeRange', {
    type: 'bar',
    data: {
      labels: levels,
      datasets: [
        {
          label: 'Вилка зарплат (Мин - Макс)',
          data: dataRanges,
          backgroundColor: gradient,
          borderColor: 'rgba(124, 58, 237, 1)',
          borderWidth: 1.5,
          borderRadius: 8,
          borderSkipped: false,
        },
        {
          label: 'Средняя зарплата',
          data: dataAverages,
          type: 'line',
          borderColor: 'rgba(236, 72, 153, 1)', // Pink
          borderWidth: 3,
          backgroundColor: 'rgba(236, 72, 153, 0.2)',
          pointBackgroundColor: 'rgba(236, 72, 153, 1)',
          pointBorderColor: '#ffffff',
          pointRadius: 6,
          pointHoverRadius: 8,
          fill: false,
          tension: 0.3
        }
      ],
    },
    options: commonOptions({
      extra: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  const range = ctx.raw;
                  return `Вилка: ${formatNumber(range[0])} — ${formatNumber(range[1])} ${currency}`;
                } else {
                  return `Средняя: ${formatNumber(ctx.raw)} ${currency}`;
                }
              },
            },
          },
        },
      },
    }),
  });
}

// Отрисовка гистограммы распределения заработных плат
export function renderChartSalary(jobs, rates, currency) {
  const canvas = document.getElementById('chartSalary');
  if (!canvas) return;

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
  const binCount = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(salaries.length))));
  const binSize = Math.ceil((max - min) / binCount / 5000) * 5000 || 10000;

  const bins = {};
  for (const s of salaries) {
    const binStart = Math.floor(s / binSize) * binSize;
    const label = formatBinLabel(binStart, binSize);
    bins[label] = (bins[label] || 0) + 1;
  }

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.85)'); // Blue
  gradient.addColorStop(1, 'rgba(14, 165, 233, 0.3)');  // Sky

  safeCreateChart('salary', 'chartSalary', {
    type: 'bar',
    data: {
      labels: Object.keys(bins),
      datasets: [{
        label: 'Количество вакансий',
        data: Object.values(bins),
        backgroundColor: gradient,
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: commonOptions({ legend: false }),
  });
}

export function renderChartEnglishSalary(jobs, rates, currency) {
  const canvas = document.getElementById('chartEnglishSalary');
  if (!canvas) return;

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

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(249, 115, 22, 0.85)'); // Orange
  gradient.addColorStop(1, 'rgba(236, 72, 153, 0.3)');  // Pink

  safeCreateChart('englishSalary', 'chartEnglishSalary', {
    type: 'bar',
    data: {
      labels: filteredLabels,
      datasets: [{
        label: `Ср. ЗП (${currency})`,
        data: filteredData,
        backgroundColor: gradient,
        borderColor: 'rgba(249, 115, 22, 1)',
        borderWidth: 1,
        borderRadius: 8,
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

// Отрисовка диаграммы самых востребованных навыков (Hard Skills)
export function renderChartSkills(jobs) {
  const canvas = document.getElementById('chartSkills');
  if (!canvas) return;

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

  const ctx = canvas.getContext('2d');
  const colors = PALETTE.slice(0, sorted.length);
  const borderColors = colors.map(c => c.replace('0.85', '1'));

  safeCreateChart('skills', 'chartSkills', {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Упоминаний',
        data: sorted.map(e => e[1]),
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1.2,
        borderRadius: 5,
        borderSkipped: false,
        barThickness: 16,
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
              font: { size: 11, weight: '600' },
              padding: 8
            }
          }
        }
      }
    })
  });
}

// Отрисовка сравнительного графика Языков программирования против Фреймворков и Инструментов
export function renderChartLanguagesVsFrameworks(jobs) {
  const canvas = document.getElementById('chartLanguagesVsFrameworks');
  if (!canvas) return;

  const langCount = {};
  const toolCount = {};

  for (const job of jobs) {
    (job.programmingLanguages || []).forEach(l => {
      langCount[l] = (langCount[l] || 0) + 1;
    });
    (job.frameworksAndTools || []).forEach(t => {
      toolCount[t] = (toolCount[t] || 0) + 1;
    });
  }

  const topLangs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topTools = Object.entries(toolCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (topLangs.length === 0 && topTools.length === 0) {
    toggleChartCardVisibility('chartLanguagesVsFrameworks', false);
    return;
  }
  toggleChartCardVisibility('chartLanguagesVsFrameworks', true);

  const labels = Array.from(new Set([...topLangs.map(e => e[0]), ...topTools.map(e => e[0])])).slice(0, 8);
  const langData = labels.map(lbl => langCount[lbl] || 0);
  const toolData = labels.map(lbl => toolCount[lbl] || 0);

  const ctx = canvas.getContext('2d');

  const gradLang = ctx.createLinearGradient(0, 0, 0, 300);
  gradLang.addColorStop(0, 'rgba(168, 85, 247, 0.85)'); // Purple
  gradLang.addColorStop(1, 'rgba(168, 85, 247, 0.3)');

  const gradTool = ctx.createLinearGradient(0, 0, 0, 300);
  gradTool.addColorStop(0, 'rgba(14, 165, 233, 0.85)'); // Sky
  gradTool.addColorStop(1, 'rgba(14, 165, 233, 0.3)');

  safeCreateChart('languagesVsTools', 'chartLanguagesVsFrameworks', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Языки программирования',
          data: langData,
          backgroundColor: gradLang,
          borderColor: 'rgba(168, 85, 247, 1)',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Фреймворки и инструменты',
          data: toolData,
          backgroundColor: gradTool,
          borderColor: 'rgba(14, 165, 233, 1)',
          borderWidth: 1,
          borderRadius: 6,
        }
      ]
    },
    options: commonOptions({
      legendPosition: 'bottom'
    })
  });
}

// Отрисовка лепестковой диаграммы популярности гибких навыков (Soft Skills)
export function renderChartSoftSkillsRadar(jobs) {
  const canvas = document.getElementById('chartSoftSkillsRadar');
  if (!canvas) return;

  const counts = {};
  for (const j of jobs) {
    (j.softSkills || []).forEach(s => {
      counts[s] = (counts[s] || 0) + 1;
    });
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (sorted.length < 3) {
    toggleChartCardVisibility('chartSoftSkillsRadar', false);
    return;
  }
  toggleChartCardVisibility('chartSoftSkillsRadar', true);

  const labels = sorted.map(e => e[0]);
  const data = sorted.map(e => e[1]);

  const textColor = currentTextColor || '#94a3b8';

  safeCreateChart('softSkillsRadar', 'chartSoftSkillsRadar', {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Частота упоминания',
        data,
        backgroundColor: 'rgba(236, 72, 153, 0.15)', // Pink Translucent
        borderColor: 'rgba(236, 72, 153, 0.85)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(99, 102, 241, 1)', // Indigo
        pointBorderColor: '#ffffff',
        pointRadius: 4,
      }]
    },
    options: commonOptions({
      noScales: true,
      extra: {
        scales: {
          r: {
            angleLines: { color: 'rgba(148, 163, 184, 0.1)' },
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            pointLabels: {
              color: textColor,
              font: { family: "'Outfit', 'Inter', sans-serif", size: 10, weight: 600 }
            },
            ticks: { display: false }
          }
        }
      }
    })
  });
}

export function renderChartSkillSynergy(jobs) {
  const canvas = document.getElementById('chartSkillSynergy');
  if (!canvas) return;

  const totalJobs = jobs.length;
  if (totalJobs < 3) {
    toggleChartCardVisibility('chartSkillSynergy', false);
    return;
  }

  const counts = {};
  for (const j of jobs) {
    const merged = Array.from(new Set([...(j.programmingLanguages || []), ...(j.frameworksAndTools || [])]));
    merged.forEach(s => {
      counts[s] = (counts[s] || 0) + 1;
    });
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) {
    toggleChartCardVisibility('chartSkillSynergy', false);
    return;
  }
  toggleChartCardVisibility('chartSkillSynergy', true);

  const labels = sorted.map(e => e[0]);
  const percents = sorted.map(e => Math.round((e[1] / totalJobs) * 100));

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 400, 0);
  gradient.addColorStop(0, 'rgba(20, 184, 166, 0.85)'); // Teal
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.4)');  // Indigo

  safeCreateChart('skillSynergy', 'chartSkillSynergy', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Доля вакансий с этим навыком',
        data: percents,
        backgroundColor: gradient,
        borderColor: 'rgba(20, 184, 166, 1)',
        borderWidth: 1,
        borderRadius: 5,
        borderSkipped: false,
        barThickness: 16,
      }]
    },
    options: commonOptions({
      legend: false,
      extra: {
        indexAxis: 'y',
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.raw}% вакансий`,
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: { display: false },
            ticks: { callback: (v) => `${v}%` }
          },
          y: {
            grid: { display: false },
            ticks: {
              autoSkip: false,
              font: { size: 11, weight: '600' },
            }
          }
        }
      }
    })
  });
}

// Отрисовка круговой диаграммы востребованности специалистов по грейдам (Junior/Middle/Senior/Lead)
export function renderChartGradeDemandDoughnut(jobs) {
  const canvas = document.getElementById('chartGradeDemandDoughnut');
  if (!canvas) return;

  const valid = jobs.map(j => mapExperienceToLevel(j.experience)).filter(Boolean);
  if (valid.length === 0) {
    toggleChartCardVisibility('chartGradeDemandDoughnut', false);
    return;
  }
  toggleChartCardVisibility('chartGradeDemandDoughnut', true);

  const counts = { 'Junior': 0, 'Middle': 0, 'Senior': 0, 'Lead': 0 };
  for (const lvl of valid) {
    if (counts[lvl] !== undefined) counts[lvl]++;
  }

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  const colors = [
    'rgba(34, 197, 94, 0.85)',   // Green
    'rgba(14, 165, 233, 0.85)',  // Sky
    'rgba(99, 102, 241, 0.85)',  // Indigo
    'rgba(236, 72, 153, 0.85)',  // Pink
  ];

  safeCreateChart('gradeDemandDoughnut', 'chartGradeDemandDoughnut', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6,
      }]
    },
    options: commonOptions({
      noScales: true,
      legendPosition: 'bottom',
      extra: {
        cutout: '70%',
        circumference: 180,
        rotation: -90,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                const pct = ((ctx.raw / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
              }
            }
          }
        }
      }
    })
  });
}

// Отрисовка круговой диаграммы распределения форматов работы (удаленка, офис, гибрид)
export function renderChartWorkFormatDoughnut(jobs) {
  const canvas = document.getElementById('chartWorkFormatDoughnut');
  if (!canvas) return;

  const valid = filterValid(jobs, 'workFormat');
  if (valid.length === 0) {
    toggleChartCardVisibility('chartWorkFormatDoughnut', false);
    return;
  }
  toggleChartCardVisibility('chartWorkFormatDoughnut', true);

  const formatLabels = {
    'Remote': 'Удаленка',
    'Office': 'Офис',
    'Hybrid': 'Гибрид'
  };

  const counts = {};
  for (const j of valid) {
    const rLabel = formatLabels[j.workFormat] || j.workFormat;
    counts[rLabel] = (counts[rLabel] || 0) + 1;
  }

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  const colorMap = {
    'Удаленка': 'rgba(34, 197, 94, 0.85)',
    'Офис': 'rgba(99, 102, 241, 0.85)',
    'Гибрид': 'rgba(249, 115, 22, 0.85)',
  };

  safeCreateChart('workFormatDoughnut', 'chartWorkFormatDoughnut', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => colorMap[l] || 'rgba(148, 163, 184, 0.5)'),
        borderWidth: 0,
        borderRadius: 4,
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
  const canvas = document.getElementById('chartWorkFormatBar');
  if (!canvas) return;

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

  const formatLabels = {
    'Remote': 'Удаленка',
    'Office': 'Офис',
    'Hybrid': 'Гибрид'
  };

  const displayFormats = formats.map(f => formatLabels[f] || f);

  const colorMap = {
    'Удаленка': 'rgba(34, 197, 94, 0.8)',
    'Офис': 'rgba(99, 102, 241, 0.8)',
    'Гибрид': 'rgba(249, 115, 22, 0.8)',
  };

  safeCreateChart('workFormatBar', 'chartWorkFormatBar', {
    type: 'bar',
    data: {
      labels: displayFormats,
      datasets: [{
        label: `Ср. ЗП (${currency})`,
        data,
        backgroundColor: displayFormats.map(f => colorMap[f]),
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

// Полное уничтожение всех активных экземпляров графиков для очистки памяти
export function destroyAllCharts() {
  for (const key of Object.keys(charts)) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }
}
