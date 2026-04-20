import { DOM } from '../dom.js';
import { charts, currentCurrency } from '../state.js';
import { convertCurrency } from '../utils/currency.js';
import { formatSalary } from '../utils/formatters.js';
import { renderChartSalary, renderChartSources, renderChartSkills, renderChartExperience, renderChartCities } from './charts.js';
import { renderJobsTable } from './table.js';

export function renderDashboard(report) {
  const jobs = report.jobs || [];
  const rates = report.exchangeRates?.rates || { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };

  if (DOM.dashTitle && DOM.dashSubtitle) {
    DOM.dashTitle.textContent = `📊 Отчёт: "${report.query}"`;
    const dateStr = new Date(report.createdAt).toLocaleString('ru-RU');
    DOM.dashSubtitle.textContent = `Создан: ${dateStr} · Источников: 3 · Вакансий: ${jobs.length}`;
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
    const avg = Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length);
    DOM.kpiAvgSalary.textContent = formatSalary(avg);

    const sorted = [...salaries].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    DOM.kpiMedianSalary.textContent = formatSalary(median);
  } else {
    DOM.kpiAvgSalary.textContent = '—';
    DOM.kpiMedianSalary.textContent = '—';
  }

  const companies = new Set(jobs.map((j) => j.company).filter(Boolean));
  DOM.kpiCompanies.textContent = companies.size;
}
