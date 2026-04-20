import { DOM } from '../dom.js';
import { currentCurrency } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { escapeHtml, formatSalary } from '../utils/formatters.js';

/**
 * Рендерит таблицу всех вакансий.
 * @param {Array} jobs — Массив вакансий.
 * @param {Object} rates — Курсы валют.
 */
export function renderJobsTable(jobs, rates) {
  if (!DOM.jobsTableBody) return;
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
