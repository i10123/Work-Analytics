/**
 * table.js
 * Суть: Менеджер интерактивной таблицы со списком вакансий.
 * Что делает: Генерирует строки таблицы, поддерживает динамический поиск по тексту, сквозную сортировку по столбцам с учетом конвертации валют.
 * Что содержит: Паттерн модуль TableManager с внутренней инкапсуляцией состояния сортировки, методы отрисовки строк renderTableRows и настройки слушателей таблицы.
 */
import { DOM } from '../dom.js';
import { appStore } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { escapeHtml, formatSalary } from '../utils/formatters.js';

const TableManager = (() => {
  let sortConfig = { key: null, direction: 'asc' };
  let currentJobs = [];
  let currentRates = {};
  let searchListenerAdded = false;
  let globalSortListenerAdded = false;
  let globalTableBodyListenerAdded = false;

  function initSearch() {
    const searchInput = document.getElementById('jobsTableSearch');
    if (searchInput && !searchListenerAdded) {
      searchListenerAdded = true;
      let timeoutId = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const q = e.target.value.toLowerCase();

          const filtered = currentJobs.filter(j =>
            (j.title || '').toLowerCase().includes(q) ||
            (j.company || '').toLowerCase().includes(q) ||
            (j.city || '').toLowerCase().includes(q) ||
            (j.skills || []).join(' ').toLowerCase().includes(q)
          );

          const sorted = sortConfig.key ? sortData(filtered, currentRates) : filtered;
          renderTableRows(sorted, currentRates);
        }, 300); // 300ms debounce
      });
    }
  }

  function initSort() {
    if (globalSortListenerAdded) return;
    globalSortListenerAdded = true;

    document.body.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const table = th.closest('#jobsTable');
      if (!table) return; // убеждаемся, что клик в нашей таблице

      const key = th.dataset.sort;

      if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfig.key = key;
        sortConfig.direction = 'asc';
      }

      const headers = table.querySelectorAll('th[data-sort]');
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(`sort-${sortConfig.direction}`);
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
  }

  function initTableBodyDelegation() {
    if (globalTableBodyListenerAdded || !DOM.jobsTableBody) return;
    globalTableBodyListenerAdded = true;

    DOM.jobsTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        // e.g. e.stopPropagation();
      }
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

    const { currentCurrency } = appStore.getState();
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

    const fragment = document.createDocumentFragment();

    jobs.forEach((job) => {
      const tr = document.createElement('tr');

      let salaryStr = '—';
      if (job.salary && (job.salary.min || job.salary.max)) {
        const { currentCurrency } = appStore.getState();
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

      const skillsHtml = (job.skills || [])
        .slice(0, 5)
        .map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`)
        .join('');
      const sourceMap = { hh: 'HH.ru', rabotaby: 'Rabota.by', habr: 'Хабр' };
      const sourceName = escapeHtml(sourceMap[job.source] || job.source);
      const sourceClass = escapeHtml(`source-badge--${job.source}`);

      let safeUrl = '#';
      if (job.url) {
        try {
          const parsedUrl = new URL(job.url, window.location.origin);
          if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
            safeUrl = escapeHtml(job.url);
          }
        } catch (e) {
          // invalid url
        }
      }

      tr.innerHTML = `
        <td><span class="source-badge ${sourceClass}">${sourceName}</span></td>
        <td>${escapeHtml(job.title)}</td>
        <td>${escapeHtml(job.company)}</td>
        <td>${escapeHtml(job.city)}</td>
        <td style="white-space: nowrap;">${escapeHtml(salaryStr)}</td>
        <td>${skillsHtml || '<span style="color: #64748b;">—</span>'}</td>
        <td>${safeUrl !== '#' ? `<a href="${safeUrl}" target="_blank" rel="noopener" style="color: var(--color-primary); text-decoration: underline; font-weight: 500;">Откликнуться</a>` : '—'}</td>
      `;

      fragment.appendChild(tr);
    });

    DOM.jobsTableBody.appendChild(fragment);
  }

  return {
    render(jobs, rates) {
      if (!DOM.jobsTableBody) return;
      const table = document.getElementById('jobsTable');
      if (!table) return;

      currentJobs = jobs;
      currentRates = rates;

      initSearch();
      initSort();
      initTableBodyDelegation();

      const dataToRender = sortConfig.key ? sortData(jobs, rates) : jobs;
      renderTableRows(dataToRender, rates);
    }
  };
})();

export const renderJobsTable = TableManager.render;
