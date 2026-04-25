import { DOM } from '../dom.js';
import { currentCurrency } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { formatSalary, formatSalaryShort } from '../utils/formatters.js';

export function getChartTheme() {
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

export function createGradient(ctxId, hexColor) {
  const canvas = document.getElementById(ctxId);
  const chartCtx = canvas.getContext('2d');
  const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, hexColor);
  gradient.addColorStop(1, hexColor + '30');
  return gradient;
}

export function renderChartSalary(jobs, rates, charts) {
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

  const card = ctx.closest('.chart-card');
  if (salaries.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

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

export function renderChartSources(report, charts) {
  const ctx = document.getElementById('chartSources');
  if (charts.sources) charts.sources.destroy();

  const theme = getChartTheme();
  const stats = report.stats?.sources || {};
  const labels = [];
  const data = [];
  const colors = [];

  if (stats.hh > 0) { labels.push('HH.ru'); data.push(stats.hh); colors.push(theme.colors[4]); } 
  if (stats.rabotaby > 0) { labels.push('Rabota.by'); data.push(stats.rabotaby); colors.push(theme.colors[2]); }
  if (stats.habr > 0) { labels.push('Хабр Карьера'); data.push(stats.habr); colors.push(theme.colors[0]); }

  const card = ctx.closest('.chart-card');
  if (data.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

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

export function renderChartSkills(jobs, charts) {
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

  const card = ctx.closest('.chart-card');
  if (data.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  const palette = theme.colors;
  const maxCount = Math.max(...data, 1);
  // Calculate relative sizes for word cloud between 12 and 50
  const normalizedData = data.map((d) => 12 + (d / maxCount) * 38);
  const bgColors = data.map((_, i) => palette[i % palette.length]);

  charts.skills = new Chart(ctx, {
    type: 'wordCloud',
    data: {
      labels,
      datasets: [{
        label: 'Упоминаний',
        data: data, // Sizes for the words
        color: bgColors,      // Colors for the words
      }],
    },
    options: {
      elements: {
        word: {
          size: (context) => 12 + (context.raw / maxCount) * 38
        }
      },
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Упоминаний: ${data[context.dataIndex]}`
          }
        }
      },
    },
  });
}

export function renderChartExperience(jobs, charts) {
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

  const card = ctx.closest('.chart-card');
  if (data.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

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

export function renderChartCities(jobs, charts) {
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
  const card = ctx.closest('.chart-card');
  if (data.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

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

/**
 * Рендерит график распределения форматов работы (Удаленка vs Офис).
 */
export function renderChartWorkFormat(jobs, charts) {
  const ctxId = 'chartWorkFormat';
  const ctx = document.getElementById(ctxId);
  if (!ctx) return;
  if (charts.workFormat) charts.workFormat.destroy();

  const theme = getChartTheme();
  const counts = { Remote: 0, Office: 0 };
  
  jobs.forEach(j => {
    const format = j.workFormat === 'Remote' ? 'Remote' : 'Office';
    counts[format]++;
  });

  const labels = ['Удаленка', 'Офис'];
  const data = [counts.Remote, counts.Office];
  
  const card = ctx.closest('.chart-card');
  if (data.every(d => d === 0)) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  // Цвета: Бирюзовый для удаленки, Индиго для офиса
  const colors = [theme.colors[1], theme.colors[0]];

  charts.workFormat = new Chart(ctx, {
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
 * Рендерит график средней зарплаты в зависимости от формата работы.
 */
export function renderChartSalaryByFormat(jobs, rates, charts) {
  const ctxId = 'chartSalaryByFormat';
  const ctx = document.getElementById(ctxId);
  if (!ctx) return;
  if (charts.salaryByFormat) charts.salaryByFormat.destroy();

  const theme = getChartTheme();
  const formatStats = {
    Remote: { sum: 0, count: 0 },
    Office: { sum: 0, count: 0 }
  };

  jobs.forEach(j => {
    if (j.salary && (j.salary.min || j.salary.max)) {
      const avg = j.salary.min && j.salary.max ? (j.salary.min + j.salary.max) / 2 : j.salary.min || j.salary.max;
      const converted = convertCurrency(avg, j.salary.currency, currentCurrency, rates);
      const format = j.workFormat === 'Remote' ? 'Remote' : 'Office';
      formatStats[format].sum += converted;
      formatStats[format].count++;
    }
  });

  const labels = ['Удаленка', 'Офис'];
  const data = [
    formatStats.Remote.count > 0 ? Math.round(formatStats.Remote.sum / formatStats.Remote.count) : 0,
    formatStats.Office.count > 0 ? Math.round(formatStats.Office.sum / formatStats.Office.count) : 0
  ];

  const card = ctx.closest('.chart-card');
  if (data.every(d => d === 0)) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  const mainColor = theme.colors[2]; // Зеленый для зарплат

  charts.salaryByFormat = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Средняя ЗП`,
        data,
        backgroundColor: createGradient(ctxId, mainColor),
        borderColor: mainColor,
        borderWidth: 1.5,
        borderRadius: 6,
        barThickness: 60,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Средняя ЗП: ${context.formattedValue} ${getCurrencySymbol(currentCurrency)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: theme.textMain }, grid: { display: false } },
        y: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
      },
    },
  });
}
