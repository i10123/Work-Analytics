import { DOM } from '../dom.js';
import { currentCurrency } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { escapeHtml, formatSalary } from '../utils/formatters.js';

/**
 * Глобальное состояние сортировки
 */
let sortConfig = {
  key: null,
  direction: 'asc'
};

let currentJobs = [];
let currentRates = {};

/**
 * Рендерит таблицу всех вакансий.
 * @param {Array} jobs — Массив вакансий.
 * @param {Object} rates — Курсы валют.
 */
export function renderJobsTable(jobs, rates) {
  if (!DOM.jobsTableBody) return;
  
  currentJobs = jobs;
  currentRates = rates;
  
  // Инициализируем обработчики поиска, если еще не сделано
  initSearch();
  // Инициализируем обработчики сортировки, если еще не сделано
  initSort();

  // Применяем текущую сортировку, если она есть
  const dataToRender = sortConfig.key ? sortData(jobs, rates) : jobs;
  renderTableRows(dataToRender, rates);
}

function initSearch() {
  const searchInput = document.getElementById('jobsTableSearch');
  if (searchInput && !searchInput.dataset.listener) {
    searchInput.dataset.listener = 'true';
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = currentJobs.filter(j => 
        (j.title || '').toLowerCase().includes(q) || 
        (j.company || '').toLowerCase().includes(q) || 
        (j.city || '').toLowerCase().includes(q) ||
        (j.skills || []).join(' ').toLowerCase().includes(q)
      );
      
      const sorted = sortConfig.key ? sortData(filtered, currentRates) : filtered;
      renderTableRows(sorted, currentRates);
    });
  }
}

function initSort() {
  const table = document.getElementById('jobsTable');
  if (!table || table.dataset.sortListener) return;
  table.dataset.sortListener = 'true';

  const headers = table.querySelectorAll('th[data-sort]');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      
      if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfig.key = key;
        sortConfig.direction = 'asc';
      }

      // Обновляем визуальные классы
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(`sort-${sortConfig.direction}`);

      // Получаем текущие отфильтрованные данные
      const searchInput = document.getElementById('jobsTableSearch');
      const q = searchInput ? searchInput.value.toLowerCase() : '';
      
      const filtered = currentJobs.filter(j => 
        (j.title || '').toLowerCase().includes(q) || 
        (j.company || '').toLowerCase().includes(q) || 
        (j.city || '').toLowerCase().includes(q) ||
        (j.skills || []).join(' ').toLowerCase().includes(q)
      );

      const sorted = sortData(filtered, currentRates);
      renderTableRows(sorted, currentRates);
    });
  });
}

function sortData(data, rates) {
  const { key, direction } = sortConfig;
  const dir = direction === 'asc' ? 1 : -1;
  const sourceMap = { hh: 'HH.ru', rabotaby: 'Rabota.by', habr: 'Хабр' };

  return [...data].sort((a, b) => {
    let valA, valB;

    if (key === 'salary') {
      valA = getSalarySortValue(a, rates);
      valB = getSalarySortValue(b, rates);
    } else if (key === 'source') {
      valA = (sourceMap[a.source] || a.source).toLowerCase();
      valB = (sourceMap[b.source] || b.source).toLowerCase();
    } else {
      valA = (a[key] || '').toString().toLowerCase();
      valB = (b[key] || '').toString().toLowerCase();
    }

    if (valA < valB) return -1 * dir;
    if (valA > valB) return 1 * dir;
    return 0;
  });
}

function getSalarySortValue(job, rates) {
  if (!job.salary) return 0;
  
  const min = job.salary.min ? convertCurrency(job.salary.min, job.salary.currency, currentCurrency, rates) : null;
  const max = job.salary.max ? convertCurrency(job.salary.max, job.salary.currency, currentCurrency, rates) : null;
  
  if (min && max) return (min + max) / 2;
  if (min) return min;
  if (max) return max;
  return 0;
}

function renderTableRows(jobs, rates) {
  DOM.jobsTableBody.innerHTML = '';

  if (jobs.length === 0) {
    DOM.jobsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">Вакансий не найдено</td></tr>';
    return;
  }

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
      <td>${escapeHtml(job.title)}</td>
      <td>${escapeHtml(job.company)}</td>
      <td>${escapeHtml(job.city)}</td>
      <td style="white-space: nowrap;">${salaryStr}</td>
      <td>${skillsHtml || '<span style="color: #64748b;">—</span>'}</td>
      <td>${job.url ? `<a href="${job.url}" target="_blank" rel="noopener" style="color: var(--color-primary); text-decoration: underline; font-weight: 500;">Откликнуться</a>` : '—'}</td>
    `;

    DOM.jobsTableBody.appendChild(tr);
  });
}
