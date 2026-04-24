import { DOM } from '../dom.js';
import { charts, currentCurrency } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { formatSalary } from '../utils/formatters.js';
import { renderChartSalary, renderChartSources, renderChartSkills, renderChartExperience, renderChartCities, renderChartWorkFormat, renderChartSalaryByFormat } from './charts.js';
import { renderJobsTable } from './table.js';

export function renderDashboard(report) {
  const jobs = report.jobs || [];
  const rates = report.exchangeRates?.rates || { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };

  if (DOM.dashTitle && DOM.dashSubtitle) {
    DOM.dashTitle.innerHTML = `<span class="dashboard__title-prefix">Отчёт:</span> ${report.query}`;
    const dateStr = new Date(report.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
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

  renderChartSalary(jobs, rates, charts);
  renderChartSources(report, charts);
  renderChartSkills(jobs, charts);
  renderChartExperience(jobs, charts);
  renderChartCities(jobs, charts);
  renderChartWorkFormat(jobs, charts);
  renderChartSalaryByFormat(jobs, rates, charts);

  renderJobsTable(jobs, rates);
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
