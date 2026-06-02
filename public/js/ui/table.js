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
  let activeSkillFilters = [];
  let activeFiltersListenerAdded = false;

  // Фильтрация списка вакансий по текстовому запросу и выбранным тегам навыков
  function getFilteredJobs(jobs) {
    const searchInput = document.getElementById('jobsTableSearch');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

    return jobs.filter(j => {
      const matchesSearch = !q ||
        (j.title || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q) ||
        (j.experience || '').toLowerCase().includes(q) ||
        (j.grade || '').toLowerCase().includes(q) ||
        (j.skills || []).join(' ').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activeSkillFilters.length > 0) {
        const jobSkillsLower = (j.skills || []).map(s => s.toLowerCase());
        const hasAllActiveFilters = activeSkillFilters.every(f =>
          jobSkillsLower.includes(f.toLowerCase())
        );
        if (!hasAllActiveFilters) return false;
      }

      return true;
    });
  }

  // Инициализация живого поиска по таблице с задержкой (debounce) в 300 мс
  function initSearch() {
    const searchInput = document.getElementById('jobsTableSearch');
    if (searchInput && !searchListenerAdded) {
      searchListenerAdded = true;
      let timeoutId = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const q = e.target.value.toLowerCase();
          const filtered = getFilteredJobs(currentJobs);
          const sorted = sortConfig.key ? sortData(filtered, currentRates) : filtered;
          renderTableRows(sorted, currentRates, q);
        }, 300);
      });
    }
  }

  // Настройка обработчиков сортировки колонок таблицы при клике на заголовки th
  function initSort() {
    if (globalSortListenerAdded) return;
    globalSortListenerAdded = true;

    document.body.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const table = th.closest('#jobsTable');
      if (!table) return;

      const key = th.dataset.sort;

      if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfig.key = key;
        sortConfig.direction = (key === 'match' || key === 'salary') ? 'desc' : 'asc';
      }

      const headers = table.querySelectorAll('th[data-sort]');
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(`sort-${sortConfig.direction}`);
      const searchInput = document.getElementById('jobsTableSearch');
      const q = searchInput ? searchInput.value.toLowerCase() : '';

      const filtered = getFilteredJobs(currentJobs);
      const sorted = sortData(filtered, currentRates);
      renderTableRows(sorted, currentRates, q);
    });
  }

  // Делегирование кликов на теле таблицы для выбора строк и переключения тегов-фильтров
  function initTableBodyDelegation() {
    if (globalTableBodyListenerAdded || !DOM.jobsTableBody) return;
    globalTableBodyListenerAdded = true;

    DOM.jobsTableBody.addEventListener('click', (e) => {
      const skillTag = e.target.closest('.skill-tag');
      if (skillTag) {
        e.stopPropagation();
        const skill = skillTag.dataset.skill;
        if (skill) {
          toggleSkillFilter(skill);
        }
        return;
      }

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

  // Переключение активности тега навыка в качестве фильтра
  function toggleSkillFilter(skill) {
    const index = activeSkillFilters.findIndex(f => f.toLowerCase() === skill.toLowerCase());
    if (index === -1) {
      activeSkillFilters.push(skill);
    } else {
      activeSkillFilters.splice(index, 1);
    }
    applyActiveFilters();
  }

  // Применение активных фильтров, обновление плашек и перерисовка строк таблицы
  function applyActiveFilters() {
    renderActiveFilterChips();

    const searchInput = document.getElementById('jobsTableSearch');
    const q = searchInput ? searchInput.value.toLowerCase() : '';

    const filtered = getFilteredJobs(currentJobs);
    const sorted = sortConfig.key ? sortData(filtered, currentRates) : filtered;

    renderTableRows(sorted, currentRates, q);
  }

  // Отрисовка плашек (чипсов) выбранных фильтров навыков
  function renderActiveFilterChips() {
    const bar = document.getElementById('tableActiveFiltersBar');
    const container = document.getElementById('tableActiveFiltersList');
    if (!bar || !container) return;

    if (activeSkillFilters.length === 0) {
      bar.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    bar.style.display = 'flex';
    container.innerHTML = activeSkillFilters
      .map(tag => `
        <span class="active-filter-chip">
          ${escapeHtml(tag)}
          <button class="active-filter-chip__clear" data-tag="${escapeHtml(tag)}" type="button" aria-label="Удалить фильтр">✕</button>
        </span>
      `).join('');
  }

  // Настройка обработчиков удаления отдельных фильтров или сброса всех фильтров
  function initActiveFiltersListeners() {
    if (activeFiltersListenerAdded) return;

    const bar = document.getElementById('tableActiveFiltersBar');
    if (bar) {
      activeFiltersListenerAdded = true;

      bar.addEventListener('click', (e) => {
        const clearBtn = e.target.closest('.active-filter-chip__clear');
        if (clearBtn) {
          const tag = clearBtn.dataset.tag;
          if (tag) {
            const idx = activeSkillFilters.findIndex(f => f.toLowerCase() === tag.toLowerCase());
            if (idx !== -1) {
              activeSkillFilters.splice(idx, 1);
              applyActiveFilters();
            }
          }
          return;
        }

        const resetBtn = e.target.closest('#btnResetTableFilters');
        if (resetBtn) {
          activeSkillFilters = [];
          applyActiveFilters();
        }
      });
    }
  }

  // Расчет процента совместимости вакансии со стеком пользователя
  function calculateCompatibility(jobSkills, userSkills) {
    if (!jobSkills || jobSkills.length === 0) return 100;
    if (!userSkills || userSkills.length === 0) return 0;
    const vLower = jobSkills.map(s => s.toLowerCase());
    const uLower = userSkills.map(s => s.toLowerCase());
    const matches = vLower.filter(s => uLower.includes(s));
    return Math.round((matches.length / vLower.length) * 100);
  }

  // Получение числового веса опыта/грейда для корректной сортировки
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

  // Сортировка массива вакансий по выбранному полю и направлению
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
      } else if (key === 'match') {
        const { userSkills = [] } = appStore.getState();
        valA = calculateCompatibility(a.skills, userSkills);
        valB = calculateCompatibility(b.skills, userSkills);
      } else {
        valA = (a[key] || '').toString().toLowerCase();
        valB = (b[key] || '').toString().toLowerCase();
      }

      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }

  // Вычисление средней конвертированной зарплаты вакансии для сортировки
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

  // Склонение слова "год/года/лет" в зависимости от числа
  function pluralizeYears(n) {
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 19) return 'лет';
    if (lastDigit === 1) return 'год';
    if (lastDigit >= 2 && lastDigit <= 4) return 'года';
    return 'лет';
  }

  // Генерация HTML-разметки для отображения грейда и требуемого опыта
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

  // Подсветка искомого слова (query) в тексте (выделение тегом mark)
  function highlightText(text, query) {
    if (!text) return '';
    if (!query || !query.trim()) return escapeHtml(text);

    const trimmedQuery = query.trim();
    const escapedQuery = trimmedQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    try {
      const regex = new RegExp(`(${escapedQuery})`, 'gi');
      const parts = text.split(regex);
      return parts.map(part => {
        if (part.toLowerCase() === trimmedQuery.toLowerCase()) {
          return `<mark class="search-highlight">${escapeHtml(part)}</mark>`;
        }
        return escapeHtml(part);
      }).join('');
    } catch (e) {
      return escapeHtml(text);
    }
  }

  // Очистка юридических префиксов (ООО, ИП) и форматирование регистра названия компании
  function cleanCompanyName(company) {
    if (!company) return '';

    let cleaned = company.replace(/["'«»‘’“”]|(^|[\s"«'‘])(ооо|ип|зао|оао)([\s"»'’]|$)/gi, ' ').trim();
    cleaned = cleaned.replace(/^["«'‘](.*)["»'’]$/, '$1').trim();


    return cleaned
      .toLowerCase()
      .replace(/(^|[\s\-\/])([a-zа-яё])/gi, (m, p, l) => p + l.toUpperCase())
      .replace(/\b(it|ai|ml|hr|qa|ui|ux|pr|ceo|cto|coo)\b/gi, (m) => m.toUpperCase());
  }

  // Генерация HTML-разметки должности с разделением на основное название и детали в скобках
  function getTitleHtml(title, query) {
    if (!title) return '';


    const match = title.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (match) {
      const mainTitle = match[1];
      const subtitle = match[2];
      return `
        <div class="title-cell">
          <span class="title-main">${highlightText(mainTitle, query)}</span>
          <span class="title-sub">${highlightText(subtitle, query)}</span>
        </div>
      `;
    }

    return `
      <div class="title-cell">
        <span class="title-main">${highlightText(title, query)}</span>
      </div>
    `;
  }

  // Генерация HTML-разметки строк таблицы и вставка фрагмента в DOM
  function renderTableRows(jobs, rates, query = '') {
    DOM.jobsTableBody.innerHTML = '';

    if (jobs.length === 0) {
      DOM.jobsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-text-secondary); padding: 2rem;">Вакансий не найдено</td></tr>';
      return;
    }

    const { userSkills = [] } = appStore.getState();

    let maxSalaryInDataset = 0;
    jobs.forEach(job => {
      if (job.salary) {
        const { currentCurrency } = appStore.getState();
        const min = job.salary.min ? convertCurrency(job.salary.min, job.salary.currency, currentCurrency, rates) : 0;
        const max = job.salary.max ? convertCurrency(job.salary.max, job.salary.currency, currentCurrency, rates) : 0;
        const val = Math.max(min, max);
        if (val > maxSalaryInDataset) {
          maxSalaryInDataset = val;
        }
      }
    });

    const fragment = document.createDocumentFragment();

    jobs.forEach((job) => {
      const tr = document.createElement('tr');

      let salaryHtml = '—';
      if (job.salary && (job.salary.min || job.salary.max)) {
        const { currentCurrency } = appStore.getState();
        const minConverted = job.salary.min ? convertCurrency(job.salary.min, job.salary.currency, currentCurrency, rates) : null;
        const maxConverted = job.salary.max ? convertCurrency(job.salary.max, job.salary.currency, currentCurrency, rates) : null;
        const sym = getCurrencySymbol(currentCurrency);

        let salaryText = '';
        if (minConverted && maxConverted) {
          salaryText = `${formatSalary(minConverted)} – ${formatSalary(maxConverted)} ${sym}`;
        } else if (minConverted) {
          salaryText = `от ${formatSalary(minConverted)} ${sym}`;
        } else if (maxConverted) {
          salaryText = `до ${formatSalary(maxConverted)} ${sym}`;
        }

        let left = 0;
        let width = 0;
        const refMax = maxSalaryInDataset || 1;

        if (minConverted && maxConverted) {
          left = (minConverted / refMax) * 100;
          width = ((maxConverted - minConverted) / refMax) * 100;
        } else if (minConverted) {
          left = (minConverted / refMax) * 100;
          width = Math.min(8, 100 - left);
        } else if (maxConverted) {
          left = 0;
          width = (maxConverted / refMax) * 100;
        }

        left = Math.max(0, Math.min(100, left));
        width = Math.max(2, Math.min(100 - left, width));

        const jobVal = getSalarySortValue(job, rates);
        const isHighSalary = maxSalaryInDataset > 0 && (jobVal >= maxSalaryInDataset * 0.7);
        const textClass = isHighSalary ? 'salary-value-text salary-value-text--high' : 'salary-value-text';

        salaryHtml = `
          <div class="salary-cell-container">
            <span class="${textClass}">${escapeHtml(salaryText)}</span>
            <div class="salary-visual-track">
              <div class="salary-visual-bar" style="left: ${left.toFixed(1)}%; width: ${width.toFixed(1)}%;"></div>
            </div>
          </div>
        `;
      }

      const pct = calculateCompatibility(job.skills, userSkills);
      let matchBadgeHtml = '';
      if (!job.skills || job.skills.length === 0) {
        matchBadgeHtml = `<span class="match-badge match-badge--none">Нет треб.</span>`;
      } else if (pct >= 80) {
        matchBadgeHtml = `<span class="match-badge match-badge--high">Совпадение: ${pct}%</span>`;
      } else if (pct >= 40) {
        matchBadgeHtml = `<span class="match-badge match-badge--medium">Совпадение: ${pct}%</span>`;
      } else {
        matchBadgeHtml = `<span class="match-badge match-badge--low">Совпадение: ${pct}%</span>`;
      }

      const skillsHtml = (job.skills || [])
        .slice(0, 8)
        .map((s) => {
          const isActive = activeSkillFilters.some(af => af.toLowerCase() === s.toLowerCase());
          const isMatch = userSkills.some(us => us.toLowerCase() === s.toLowerCase());

          let classModifier = '';
          if (isActive) {
            classModifier = ' skill-tag--active-filter';
          } else if (userSkills.length > 0) {
            classModifier = isMatch ? ' skill-tag--match' : ' skill-tag--missing';
          }

          return `<span class="skill-tag${classModifier}" data-skill="${escapeHtml(s)}">${highlightText(s, query)}</span>`;
        })
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

        }
      }

      tr.innerHTML = `
        <td class="col-source">${sourceCapsuleHtml}</td>
        <td class="col-title">${getTitleHtml(job.title, query)}</td>
        <td class="col-company"><span class="company-text">${highlightText(cleanCompanyName(job.company), query)}</span></td>
        <td class="col-experience">${getExperienceHtml(job)}</td>
        <td class="col-salary">${salaryHtml}</td>
        <td class="col-match">${matchBadgeHtml}</td>
        <td class="col-skills">${skillsHtml || '<span style="color: #64748b;">—</span>'}</td>
        <td class="col-action">${safeUrl !== '#' ? `
          <a href="${safeUrl}" target="_blank" rel="noopener" class="apply-btn">
            <span>Откликнуться</span>
            <svg class="apply-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        ` : '—'}</td>
      `;

      fragment.appendChild(tr);
    });

    DOM.jobsTableBody.appendChild(fragment);
  }

  return {
    // Публичный метод инициализации и перерисовки всей таблицы вакансий
    render(jobs, rates) {
      if (!DOM.jobsTableBody) return;
      const table = document.getElementById('jobsTable');
      if (!table) return;

      if (currentJobs !== jobs) {
        activeSkillFilters = [];
      }

      currentJobs = jobs;
      currentRates = rates;

      initSearch();
      initSort();
      initTableBodyDelegation();
      initActiveFiltersListeners();

      renderActiveFilterChips();

      const searchInput = document.getElementById('jobsTableSearch');
      const q = searchInput ? searchInput.value.toLowerCase() : '';

      const filtered = getFilteredJobs(jobs);
      const dataToRender = sortConfig.key ? sortData(filtered, rates) : filtered;
      renderTableRows(dataToRender, rates, q);
    }
  };
})();

export const renderJobsTable = TableManager.render;