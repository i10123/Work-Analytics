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
        (j.skills || []).join(' ').toLowerCase().includes(q)
      );

      const sorted = sortData(filtered, currentRates);
      renderTableRows(sorted, currentRates);
    });
  }

  let activePopoverTarget = null;

  function getOrCreatePopover() {
    let popover = document.getElementById('skills-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'skills-popover';
      popover.className = 'skills-popover';
      document.body.appendChild(popover);

      // Close popover when clicking anywhere else
      document.addEventListener('click', (e) => {
        if (activePopoverTarget && !popover.contains(e.target) && !e.target.closest('.skill-tag--more')) {
          hideSkillsPopover();
        }
      });

      // Handle clicking a skill inside the popover to filter the table
      popover.addEventListener('click', (e) => {
        const tag = e.target.closest('.skill-tag');
        if (tag) {
          const skillName = tag.textContent.trim();
          const searchInput = document.getElementById('jobsTableSearch');
          if (searchInput) {
            searchInput.value = skillName;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          hideSkillsPopover();
        }
      });
    }
    return popover;
  }

  function hideSkillsPopover() {
    const popover = document.getElementById('skills-popover');
    if (popover) {
      popover.classList.remove('active');
      activePopoverTarget = null;
    }
  }

  function toggleSkillsPopover(target) {
    const popover = getOrCreatePopover();

    if (activePopoverTarget === target) {
      hideSkillsPopover();
      return;
    }

    activePopoverTarget = target;
    const skillsData = JSON.parse(target.dataset.skills || '[]');

    popover.innerHTML = `
      <div class="skills-popover__title">Все навыки (${skillsData.length})</div>
      <div class="skills-popover__list">
        ${skillsData.map(s => `<span class="skill-tag" style="cursor: pointer;" title="Нажмите для фильтрации">${escapeHtml(s)}</span>`).join('')}
      </div>
    `;

    popover.classList.add('active');

    // Position popover perfectly above the target
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const popoverWidth = Math.min(280, window.innerWidth - 40);
    popover.style.width = `${popoverWidth}px`;
    
    // Quick layout pass
    const popoverHeight = popover.offsetHeight || 120;

    const left = rect.left + scrollX + (rect.width / 2) - (popoverWidth / 2);
    const top = rect.top + scrollY - popoverHeight - 10; // 10px spacing

    popover.style.left = `${Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, left))}px`;
    popover.style.top = `${top}px`;
  }

  function initTableBodyDelegation() {
    if (globalTableBodyListenerAdded || !DOM.jobsTableBody) return;
    globalTableBodyListenerAdded = true;

    DOM.jobsTableBody.addEventListener('click', (e) => {
      // 1. Clicked a regular skill tag -> Filter table by this skill name
      const skillTag = e.target.closest('.skill-tag:not(.skill-tag--more)');
      if (skillTag && !e.target.closest('#skills-popover')) {
        const skillName = skillTag.textContent.trim();
        const searchInput = document.getElementById('jobsTableSearch');
        if (searchInput) {
          searchInput.value = skillName;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // 2. Clicked the "+N" tag -> Toggle popover
      const moreTag = e.target.closest('.skill-tag--more');
      if (moreTag) {
        toggleSkillsPopover(moreTag);
        e.stopPropagation();
        return;
      }

      // 3. Otherwise hide popover
      hideSkillsPopover();
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

      const allSkills = job.skills || [];
      let skillsHtml = '';

      if (allSkills.length === 0) {
        skillsHtml = '<span style="color: var(--color-text-muted);">—</span>';
      } else {
        // Оборачиваем все теги в div.skills-wrapper
        const tagsHtml = allSkills
          .map((s) => `<span class="skill-tag" title="Нажмите для фильтрации">${escapeHtml(s)}</span>`)
          .join('');
          
        skillsHtml = `<div class="skills-wrapper">${tagsHtml}</div>`;
      }

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
        <td class="td-truncate td-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</td>
        <td class="td-truncate td-company" title="${escapeHtml(job.company)}">${escapeHtml(job.company)}</td>
        <td class="td-truncate td-experience" title="${escapeHtml(job.experience)}">${escapeHtml(job.experience)}</td>
        <td style="white-space: nowrap;">${escapeHtml(salaryStr)}</td>
        <td class="td-skills">${skillsHtml}</td>
        <td class="td-action">${safeUrl !== '#' ? `<a href="${safeUrl}" target="_blank" rel="noopener" style="color: var(--color-primary); text-decoration: underline; font-weight: 500;">Откликнуться</a>` : '—'}</td>
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
