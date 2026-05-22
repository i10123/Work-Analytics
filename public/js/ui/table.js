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
            (j.experience || '').toLowerCase().includes(q) ||
            (j.grade || '').toLowerCase().includes(q) ||
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
        (j.experience || '').toLowerCase().includes(q) ||
        (j.grade || '').toLowerCase().includes(q) ||
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
      const tr = e.target.closest('tr');
      if (!tr) return;

      const siblingRows = DOM.jobsTableBody.querySelectorAll('tr');
      siblingRows.forEach(row => {
        if (row !== tr) {
          row.classList.remove('selected');
        }
      });

      tr.classList.toggle('selected');
    });
  }

  function getExperienceSortValue(job) {
    if (typeof job.experience_years_min === 'number') {
      return job.experience_years_min;
    }
    if (typeof job.experience_years_max === 'number') {
      return job.experience_years_max - 0.5;
    }
    
    let grade = job.grade || 'Не указано';
    if (grade === 'Не указано' && job.experience) {
      const expLower = job.experience.toLowerCase();
      if (expLower.includes('intern') || expLower.includes('стажер') || expLower.includes('стажёр')) grade = 'Intern';
      else if (expLower.includes('junior') || expLower.includes('младший') || expLower.includes('без опыта')) grade = 'Junior';
      else if (expLower.includes('middle') || expLower.includes('средний') || expLower.includes('от 1 года') || expLower.includes('1-3')) grade = 'Middle';
      else if (expLower.includes('senior') || expLower.includes('старший') || expLower.includes('от 3 до 6') || expLower.includes('3-6')) grade = 'Senior';
      else if (expLower.includes('lead') || expLower.includes('ведущий') || expLower.includes('более 6')) grade = 'Lead';
    }
    
    const gradeWeights = {
      'Intern': 0.5,
      'Junior': 1,
      'Middle': 3,
      'Senior': 5,
      'Lead': 7,
    };
    return gradeWeights[grade] || 0;
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
      } else if (key === 'experience') {
        valA = getExperienceSortValue(a);
        valB = getExperienceSortValue(b);
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

  function pluralizeYears(n) {
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 19) return 'лет';
    if (lastDigit === 1) return 'год';
    if (lastDigit >= 2 && lastDigit <= 4) return 'года';
    return 'лет';
  }

  function getExperienceHtml(job) {
    let grade = job.grade || 'Не указано';
    if (grade === 'Не указано' && job.experience) {
      const expLower = job.experience.toLowerCase();
      if (expLower.includes('intern') || expLower.includes('стажер') || expLower.includes('стажёр')) grade = 'Intern';
      else if (expLower.includes('junior') || expLower.includes('младший') || expLower.includes('без опыта')) grade = 'Junior';
      else if (expLower.includes('middle') || expLower.includes('средний') || expLower.includes('от 1 года') || expLower.includes('1-3')) grade = 'Middle';
      else if (expLower.includes('senior') || expLower.includes('старший') || expLower.includes('от 3 до 6') || expLower.includes('3-6')) grade = 'Senior';
      else if (expLower.includes('lead') || expLower.includes('ведущий') || expLower.includes('более 6')) grade = 'Lead';
    }
    
    let yearsText = '';
    if (typeof job.experience_years_min === 'number' && typeof job.experience_years_max === 'number') {
      if (job.experience_years_min === job.experience_years_max) {
        yearsText = `${job.experience_years_min} ${pluralizeYears(job.experience_years_min)}`;
      } else {
        yearsText = `${job.experience_years_min}–${job.experience_years_max} ${pluralizeYears(job.experience_years_max)}`;
      }
    } else if (typeof job.experience_years_min === 'number') {
      yearsText = `от ${job.experience_years_min} ${pluralizeYears(job.experience_years_min)}`;
    } else if (typeof job.experience_years_max === 'number') {
      yearsText = `до ${job.experience_years_max} ${pluralizeYears(job.experience_years_max)}`;
    } else if (job.experience && job.experience !== 'Не указан' && job.experience !== 'Не указано') {
      yearsText = job.experience;
    } else {
      yearsText = '—';
    }

    const gradeClasses = {
      'Intern': 'grade-badge grade-badge--intern',
      'Junior': 'grade-badge grade-badge--junior',
      'Middle': 'grade-badge grade-badge--middle',
      'Senior': 'grade-badge grade-badge--senior',
      'Lead': 'grade-badge grade-badge--lead',
      'Не указано': 'grade-badge grade-badge--unknown',
      'Не указан': 'grade-badge grade-badge--unknown'
    };

    const gradeClass = gradeClasses[grade] || 'grade-badge grade-badge--unknown';
    const gradeLabel = grade === 'Не указано' || grade === 'Не указан' ? 'Не указан' : grade;

    return `
      <div class="experience-cell">
        <span class="${gradeClass}">${escapeHtml(gradeLabel)}</span>
        <span class="experience-years">${escapeHtml(yearsText)}</span>
      </div>
    `;
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
        .slice(0, 8)
        .map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`)
        .join('');
      let sourceCapsuleHtml = '';
      if (job.source === 'hh') {
        sourceCapsuleHtml = `
          <div class="source-capsule source-capsule--hh">
            <span class="source-capsule__icon">hh</span>
            <span class="source-capsule__name">HH.ru</span>
          </div>
        `;
      } else if (job.source === 'rabotaby') {
        sourceCapsuleHtml = `
          <div class="source-capsule source-capsule--rabotaby">
            <span class="source-capsule__icon">R</span>
            <span class="source-capsule__name">Rabota.by</span>
          </div>
        `;
      } else if (job.source === 'habr') {
        sourceCapsuleHtml = `
          <div class="source-capsule source-capsule--habr">
            <span class="source-capsule__icon">H</span>
            <span class="source-capsule__name">Хабр</span>
          </div>
        `;
      } else {
        sourceCapsuleHtml = `<span style="color: var(--color-text-muted); font-weight: 700;">${escapeHtml(job.source)}</span>`;
      }

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
        <td class="col-source">${sourceCapsuleHtml}</td>
        <td class="col-title">${escapeHtml(job.title)}</td>
        <td class="col-company">${escapeHtml(job.company)}</td>
        <td class="col-experience">${getExperienceHtml(job)}</td>
        <td class="col-salary" style="white-space: nowrap;">${escapeHtml(salaryStr)}</td>
        <td class="col-skills">${skillsHtml || '<span style="color: #64748b;">—</span>'}</td>
        <td class="col-action">${safeUrl !== '#' ? `<a href="${safeUrl}" target="_blank" rel="noopener" style="color: var(--color-primary); text-decoration: underline; font-weight: 500;">Откликнуться</a>` : '—'}</td>
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
