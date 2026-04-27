import { DOM } from '../dom.js';
import { charts, currentCurrency } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { formatSalary, escapeHtml } from '../utils/formatters.js';
import {
  renderChartSalary,
  renderChartSkills,
  renderChartSalaryVsExperience,
  renderChartWorkFormatDoughnut,
  renderChartWorkFormatBar,
  renderChartEnglishSalary,
  renderChartTechCategory,
  renderChartDynamics,
  destroyAllCharts,
} from './charts.js';
import { renderJobsTable } from './table.js';

export function renderDashboard(report) {
  const jobs = report.jobs || [];
  const rates = report.exchangeRates?.rates || { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };

  if (DOM.dashTitle && DOM.dashSubtitle) {
    DOM.dashTitle.innerHTML = `<span class="dashboard__title-prefix">Отчёт:</span> ${escapeHtml(report.query)}`;
    const parsedDate = new Date(report.createdAt);
    const dateStr = isNaN(parsedDate.getTime()) ? 'Дата неизвестна' : parsedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    DOM.dashSubtitle.textContent = `Сформирован ${dateStr}`;
    
    // Вставляем бейджи
    const badgesContainer = document.getElementById('dashBadges');
    if (badgesContainer) {
      badgesContainer.innerHTML = `
        <span class="dash-badge">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-10.6 8.5 8.5 0 0 1 3 1.5"></path><path d="M22 4l-10 10-3-3"></path></svg>
          ${jobs.length} вакансий
        </span>
        <span class="dash-badge dash-badge--accent">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
          3 источника
        </span>
      `;
    }
  }

  if (DOM.alertPartial && DOM.alertPartialText) {
    if (report.errors && report.errors.length > 0) {
      const sourceNames = { hh: 'HH.ru', rabotaby: 'Rabota.by', habr: 'Хабр Карьера' };
      const failedSources = report.errors.map((e) => sourceNames[e] || e).join(', ');
      DOM.alertPartial.style.display = 'flex';
      DOM.alertPartialText.textContent = `Сбор завершён частично. Недоступные источники: ${failedSources}`;
    } else {
      DOM.alertPartial.style.display = 'none';
    }
  }

  renderKPI(jobs, rates);

  // Уничтожаем старые графики перед рендером новых
  destroyAllCharts();

  // Рендерим все графики
  renderChartSalary(jobs, rates, currentCurrency);
  renderChartSkills(jobs);
  renderChartSalaryVsExperience(jobs, rates, currentCurrency);
  renderChartWorkFormatDoughnut(jobs);
  renderChartWorkFormatBar(jobs, rates, currentCurrency);
  renderChartEnglishSalary(jobs, rates, currentCurrency);
  renderChartTechCategory(jobs);

  // Динамика — подгружаем все отчёты для сравнения
  fetch('/api/reports')
    .then(r => r.json())
    .then(data => {
      if (data.success && data.reports) {
        renderChartDynamics(data.reports, currentCurrency, rates);
      }
    })
    .catch(() => {});

  renderJobsTable(jobs, rates);

  // Обработчик экспорта (удаляем старый, чтобы не плодить)
  if (DOM.btnExportCsv) {
    DOM.btnExportCsv.onclick = () => exportToCSV(jobs, report.query);
  }
}

function exportToCSV(jobs, query) {
  if (!jobs || jobs.length === 0) return;

  const BOM = '\uFEFF';
  const delimiter = ';';
  const headers = ['Источник', 'ID', 'Должность', 'Компания', 'Город', 'Формат', 'Опыт', 'Занятость', 'Зарплата (мин)', 'Зарплата (макс)', 'Валюта', 'Навыки', 'Ссылка'];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    str = str.replace(/"/g, '""');
    // Исправлено: проверяем реальный перенос строки, а не экранированный
    if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

  // Исправлено: используем \r\n для правильного переноса строк в Excel
  let csvContent = BOM + headers.join(delimiter) + '\r\n';

  jobs.forEach(j => {
    const row = [
      j.source,
      `="${j.sourceId}"`,
      j.title,
      j.company,
      j.city,
      j.workFormat,
      j.experience,
      j.employment,
      j.salary?.min || '',
      j.salary?.max || '',
      j.salary?.currency || '',
      (j.skills || []).join(', '),
      j.url
    ];
    // Исправлено: используем \r\n
    csvContent += row.map(escapeCsv).join(delimiter) + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  
  const safeQuery = query.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase();
  link.setAttribute('download', `analytics_${safeQuery}_${new Date().toISOString().slice(0, 10)}.csv`);
  
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderKPI(jobs, rates) {
  if (!DOM.kpiTotal) return;
  DOM.kpiTotal.textContent = jobs.length;

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
    const sym = getCurrencySymbol(currentCurrency);
    const avg = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length);
    DOM.kpiAvgSalary.textContent = `${formatSalary(avg)} ${sym}`;

    const sorted = [...salaries].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    DOM.kpiMedianSalary.textContent = `${formatSalary(median)} ${sym}`;
  } else {
    DOM.kpiAvgSalary.textContent = '—';
    DOM.kpiMedianSalary.textContent = '—';
  }

  const companies = new Set(jobs.map((j) => j.company).filter(Boolean));
  DOM.kpiCompanies.textContent = companies.size;

  const remoteCount = jobs.filter(j => j.workFormat === 'Remote').length;
  const remotePercent = jobs.length > 0 ? Math.round((remoteCount / jobs.length) * 100) : 0;
  if (DOM.kpiRemote) {
    DOM.kpiRemote.textContent = `${remotePercent}%`;
  }
}
