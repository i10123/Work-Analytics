import { DOM } from '../dom.js';
import { currentCurrency, allReports as stateReports } from '../state.js';
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

/**
 * Рендерит Grouped Bar Chart: Опыт (X) vs Зарплата (Y)
 */
export function renderChartSalaryExp(jobs, rates, charts) {
  const ctxId = 'chartSalaryExp';
  const ctx = document.getElementById(ctxId);
  if (!ctx) return;
  if (charts.salaryExp) charts.salaryExp.destroy();

  const theme = getChartTheme();
  
  // Группируем по опыту
  const expStats = {};
  
  jobs.forEach(j => {
    const exp = j.experience || 'Не указан';
    if (!expStats[exp]) expStats[exp] = { minSum: 0, minCount: 0, maxSum: 0, maxCount: 0 };
    
    if (j.salary) {
      if (j.salary.min) {
        expStats[exp].minSum += convertCurrency(j.salary.min, j.salary.currency, currentCurrency, rates);
        expStats[exp].minCount++;
      }
      if (j.salary.max) {
        expStats[exp].maxSum += convertCurrency(j.salary.max, j.salary.currency, currentCurrency, rates);
        expStats[exp].maxCount++;
      }
    }
  });

  const orderedExp = ['Intern', 'Junior', 'Middle', 'Senior', 'Lead', 'Нет опыта', 'От 1 года до 3 лет', 'От 3 до 6 лет', 'Более 6 лет', 'Не указан'];
  const labels = Object.keys(expStats).sort((a, b) => {
    const ia = orderedExp.indexOf(a);
    const ib = orderedExp.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const dataMin = labels.map(exp => expStats[exp].minCount > 0 ? Math.round(expStats[exp].minSum / expStats[exp].minCount) : null);
  const dataMax = labels.map(exp => expStats[exp].maxCount > 0 ? Math.round(expStats[exp].maxSum / expStats[exp].maxCount) : null);

  const card = ctx.closest('.chart-card');
  if (dataMin.every(d => d === null) && dataMax.every(d => d === null)) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  charts.salaryExp = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Средняя MIN ЗП',
          data: dataMin,
          backgroundColor: theme.colors[1],
          borderRadius: 4,
        },
        {
          label: 'Средняя MAX ЗП',
          data: dataMax,
          backgroundColor: theme.colors[0],
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: theme.textSecondary }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.formattedValue} ${getCurrencySymbol(currentCurrency)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: theme.textMain }, grid: { display: false } },
        y: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
      }
    }
  });
}

/**
 * Рендерит Horizontal Bar Chart: Топ-10 связок навыков
 */
export function renderChartSkillsCorrel(jobs, charts) {
  const ctxId = 'chartSkillsCorrel';
  const ctx = document.getElementById(ctxId);
  if (!ctx) return;
  if (charts.skillsCorrel) charts.skillsCorrel.destroy();

  const theme = getChartTheme();
  const pairCount = {};

  jobs.forEach(job => {
    const skills = (job.skills || []).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (skills.length < 2) return;
    
    // Генерируем все уникальные пары (combinations)
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        // Лексикографическая сортировка
        const pair = [skills[i], skills[j]].sort();
        const pairKey = pair.join(' + ');
        pairCount[pairKey] = (pairCount[pairKey] || 0) + 1;
      }
    }
  });

  const sortedPairs = Object.entries(pairCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = sortedPairs.map(p => p[0]);
  const data = sortedPairs.map(p => p[1]);

  const card = ctx.closest('.chart-card');
  if (data.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  const mainColor = theme.colors[3]; // Оранжевый

  charts.skillsCorrel = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Частота',
        data,
        backgroundColor: createGradient(ctxId, mainColor),
        borderColor: mainColor,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
        y: { ticks: { color: theme.textMain, font: { size: 11 } }, grid: { display: false } },
      }
    }
  });
}

/**
 * Рендерит Line Chart: Динамика ЗП во времени
 */
export async function renderChartDynamics(report, charts) {
  const ctxId = 'chartDynamics';
  const ctx = document.getElementById(ctxId);
  const select = document.getElementById('dynamicsQuerySelect');
  if (!ctx || !select) return;

  const theme = getChartTheme();

  try {
    // Используем стейт вместо лишнего запроса к серверу
    if (!stateReports || stateReports.length === 0) return;

    // Копируем и сортируем по дате по возрастанию (не мутируем стейт)
    const allReports = [...stateReports].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Заполняем select уникальными запросами
    const uniqueQueries = [...new Set(allReports.map(r => r.query))];
    const currentVal = select.value;
    select.innerHTML = '<option value="">Выберите запрос...</option>';
    uniqueQueries.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q;
      opt.textContent = q;
      select.appendChild(opt);
    });

    // Устанавливаем текущий query отчета
    if (!currentVal && uniqueQueries.includes(report.query)) {
      select.value = report.query;
    } else if (currentVal) {
      select.value = currentVal;
    }

    const drawChart = () => {
      if (charts.dynamics) charts.dynamics.destroy();
      const selectedQuery = select.value;
      
      const filtered = allReports.filter(r => r.query === selectedQuery);
      
      const card = ctx.closest('.chart-card');
      if (filtered.length < 2) {
        // Мало данных для тренда
        if (card) {
          // Выводим заглушку или скрываем
          if (charts.dynamics) charts.dynamics.destroy();
          const canvasCtx = ctx.getContext('2d');
          canvasCtx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          canvasCtx.font = "14px Arial";
          canvasCtx.fillStyle = theme.textSecondary;
          canvasCtx.textAlign = "center";
          canvasCtx.fillText("Недостаточно данных для графика (нужно > 1 отчета)", ctx.canvas.width/2, ctx.canvas.height/2);
        }
        return;
      }
      
      const labels = filtered.map(r => new Date(r.createdAt).toLocaleDateString('ru-RU'));
      // Если ЗП нет, берем null (spanGaps: true)
      const data = filtered.map(r => r.stats?.avgSalaryNormalized > 0 ? r.stats.avgSalaryNormalized : null);

      const mainColor = theme.colors[4]; // Красный/розовый

      charts.dynamics = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Средняя ЗП (RUB)',
            data,
            borderColor: mainColor,
            backgroundColor: mainColor + '20',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: mainColor,
            spanGaps: true, // Защита от обрыва линии при null
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `Средняя ЗП: ${context.formattedValue} RUB`
              }
            }
          },
          scales: {
            x: { ticks: { color: theme.textSecondary, maxRotation: 45 }, grid: { color: theme.grid } },
            y: { ticks: { color: theme.textSecondary }, grid: { color: theme.grid } },
          }
        }
      });
    };

    drawChart();
    // Используем AbortController для чистой отписки от событий
    if (charts.dynamicsController) {
      charts.dynamicsController.abort();
    }
    charts.dynamicsController = new AbortController();

    select.addEventListener('change', drawChart, {
      signal: charts.dynamicsController.signal
    });

  } catch (err) {
    console.error('Ошибка загрузки данных для динамики:', err);
  }
}
