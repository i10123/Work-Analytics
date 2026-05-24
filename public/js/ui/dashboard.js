
import { DOM } from '../dom.js';
import { appStore } from '../state.js';
import { convertCurrency, getCurrencySymbol } from '../utils/currency.js';
import { formatSalary, escapeHtml, parseMarkdown } from '../utils/formatters.js';
import {
  renderChartSalaryGradeRange,
  renderChartSalary,
  renderChartEnglishSalary,
  renderChartSkills,
  renderChartLanguagesVsFrameworks,
  renderChartSoftSkillsRadar,
  renderChartSkillSynergy,
  renderChartGradeDemandDoughnut,
  renderChartWorkFormatDoughnut,
  renderChartWorkFormatBar,
  destroyAllCharts,
  updateChartColors,
} from './charts.js';
import { renderJobsTable } from './table.js';
import { restoreScrollPosition } from './common.js';

let activeChartTab = localStorage.getItem('active-chart-tab') || 'money';
let lastRenderedReportId = null;

function renderTabCharts(tabName, jobs, rates, currency) {
  destroyAllCharts();
  updateChartColors();

  if (tabName === 'money') {
    renderChartSalaryGradeRange(jobs, rates, currency);
    renderChartSalary(jobs, rates, currency);
    renderChartEnglishSalary(jobs, rates, currency);
  } else if (tabName === 'skills') {
    renderChartSkills(jobs);
    renderChartLanguagesVsFrameworks(jobs);
    renderChartSoftSkillsRadar(jobs);
    renderChartSkillSynergy(jobs);
  } else if (tabName === 'market') {
    renderChartGradeDemandDoughnut(jobs);
    renderChartWorkFormatDoughnut(jobs);
    renderChartWorkFormatBar(jobs, rates, currency);
  }
}

function initChartTabsListener(jobs, rates, currency) {
  const tabs = document.querySelectorAll('.dashboard__charts-tab');
  const sections = document.querySelectorAll('.charts-section');

  tabs.forEach(tab => {
    const tabName = tab.dataset.chartTab;
    tab.classList.toggle('active', tabName === activeChartTab);

    sections.forEach(s => {
      if (s.id === `chartsSection-${activeChartTab}`) {
        s.classList.add('active');
        s.style.display = 'grid';
      } else {
        s.classList.remove('active');
        s.style.display = 'none';
      }
    });

    tab.onclick = () => {
      const selectedTab = tab.dataset.chartTab;
      activeChartTab = selectedTab;
      localStorage.setItem('active-chart-tab', selectedTab);

      tabs.forEach(t => t.classList.toggle('active', t.dataset.chartTab === selectedTab));
      sections.forEach(s => {
        if (s.id === `chartsSection-${selectedTab}`) {
          s.classList.add('active');
          s.style.display = 'grid';
        } else {
          s.classList.remove('active');
          s.style.display = 'none';
        }
      });

      renderTabCharts(selectedTab, jobs, rates, currency);
    };
  });
}

export function renderDashboard(report) {
  const jobs = report.jobs || [];
  const rates = report.exchangeRates?.rates || { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };

  if (DOM.dashTitle && DOM.dashSubtitle) {
    DOM.dashTitle.innerHTML = `<span class="dashboard__title-prefix">Отчёт:</span> ${escapeHtml(report.query)}`;
    const parsedDate = new Date(report.createdAt);
    const dateStr = isNaN(parsedDate.getTime()) ? 'Дата неизвестна' : parsedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    DOM.dashSubtitle.textContent = `Сформирован ${dateStr}`;

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
  renderAiSummary(report);

  if (lastRenderedReportId !== report.id) {
    lastRenderedReportId = report.id;
  }

  const { currentCurrency } = appStore.getState();
  renderTabCharts(activeChartTab, jobs, rates, currentCurrency);
  initChartTabsListener(jobs, rates, currentCurrency);



  renderJobsTable(jobs, rates);

  initJobMatching(report, rates);

  if (DOM.btnExportCsv) {
    DOM.btnExportCsv.onclick = () => exportToCSV(jobs, report.query);
  }

  restoreScrollPosition('dashboard');
}

function renderAiSummary(report) {
  if (!DOM.aiSummaryCard || !DOM.btnGenerateAiSummary || !DOM.btnUpdateAiSummary || !DOM.aiSummaryContent || !DOM.aiSummaryLoader || !DOM.aiSummaryWarning) return;

  DOM.aiSummaryLoader.style.display = 'none';
  DOM.aiSummaryContent.style.display = 'none';
  DOM.aiSummaryContent.innerHTML = '';
  if (DOM.aiSummaryPlaceholder) {
    DOM.aiSummaryPlaceholder.style.display = 'none';
  }

  if (DOM.aiSummaryCardHeader && !DOM.aiSummaryCardHeader.dataset.initialized) {
    DOM.aiSummaryCardHeader.dataset.initialized = 'true';
    DOM.aiSummaryCardHeader.addEventListener('click', (event) => {
      if (event.target.closest('#btnGenerateAiSummary') || event.target.closest('#btnUpdateAiSummary')) {
        return;
      }

      if (!DOM.aiSummaryCardHeader.classList.contains('ai-summary-card__header--clickable')) {
        return;
      }

      const isCollapsed = DOM.aiSummaryContent.style.display === 'none';
      if (isCollapsed) {
        DOM.aiSummaryContent.style.display = 'block';
        if (DOM.aiSummaryCollapseIcon) DOM.aiSummaryCollapseIcon.style.transform = 'rotate(0deg)';
      } else {
        DOM.aiSummaryContent.style.display = 'none';
        if (DOM.aiSummaryCollapseIcon) DOM.aiSummaryCollapseIcon.style.transform = 'rotate(180deg)';
      }
    });
  }

  if (DOM.btnCollapseAiSummary) {
    DOM.btnCollapseAiSummary.style.display = 'none';
  }

  const generateAction = async (btnToHide) => {
    btnToHide.style.display = 'none';
    DOM.btnGenerateAiSummary.style.display = 'none';
    DOM.btnUpdateAiSummary.style.display = 'none';
    DOM.aiSummaryLoader.style.display = 'flex';
    DOM.aiSummaryContent.style.display = 'none';
    if (DOM.aiSummaryPlaceholder) {
      DOM.aiSummaryPlaceholder.style.display = 'none';
    }

    try {
      const { userSkills = [] } = appStore.getState();
      const res = await fetch(`/api/reports/${report.id}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedSkills: userSkills })
      });
      const data = await res.json();

      DOM.aiSummaryLoader.style.display = 'none';
      if (data.success) {
        report.aiSummary = data.summary;
        DOM.aiSummaryContent.innerHTML = parseMarkdown(data.summary);
        DOM.aiSummaryContent.style.display = 'block';
        if (DOM.aiSummaryCardHeader) {
          DOM.aiSummaryCardHeader.classList.add('ai-summary-card__header--clickable');
        }
        if (DOM.btnCollapseAiSummary) {
          DOM.btnCollapseAiSummary.style.display = 'inline-flex';
          if (DOM.aiSummaryCollapseIcon) DOM.aiSummaryCollapseIcon.style.transform = 'rotate(0deg)';
        }
        syncAiSummaryUI(report);
      } else {
        DOM.aiSummaryContent.innerHTML = `<div class="alert alert--warning" style="margin-top:10px;"><span class="alert__icon">❌</span> <span class="alert__text">${escapeHtml(data.error || 'Ошибка при генерации')}</span></div>`;
        DOM.aiSummaryContent.style.display = 'block';
        syncAiSummaryUI(report);
      }
    } catch (err) {
      DOM.aiSummaryLoader.style.display = 'none';
      DOM.aiSummaryContent.innerHTML = `<div class="alert alert--warning" style="margin-top:10px;"><span class="alert__icon">❌</span> <span class="alert__text">Сетевая ошибка: не удалось подключиться к серверу.</span></div>`;
      DOM.aiSummaryContent.style.display = 'block';
      syncAiSummaryUI(report);
    }
  };

  DOM.btnGenerateAiSummary.onclick = () => generateAction(DOM.btnGenerateAiSummary);
  DOM.btnUpdateAiSummary.onclick = () => generateAction(DOM.btnUpdateAiSummary);

  if (report.aiSummary) {
    DOM.aiSummaryContent.innerHTML = parseMarkdown(report.aiSummary);
    DOM.aiSummaryContent.style.display = 'none';
    if (DOM.aiSummaryCardHeader) {
      DOM.aiSummaryCardHeader.classList.add('ai-summary-card__header--clickable');
    }
    if (DOM.btnCollapseAiSummary) {
      DOM.btnCollapseAiSummary.style.display = 'inline-flex';
      if (DOM.aiSummaryCollapseIcon) DOM.aiSummaryCollapseIcon.style.transform = 'rotate(180deg)';
    }
  } else {
    if (DOM.aiSummaryCardHeader) {
      DOM.aiSummaryCardHeader.classList.remove('ai-summary-card__header--clickable');
    }
  }

  syncAiSummaryUI(report);
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
    if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

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

  const withSalaryCount = jobs.filter((j) => j.salary && (j.salary.min > 0 || j.salary.max > 0)).length;
  const noSalaryCount = jobs.length - withSalaryCount;
  if (DOM.kpiNoSalary) DOM.kpiNoSalary.textContent = noSalaryCount;

  const salaries = jobs
    .filter((j) => j.salary && (j.salary.min > 0 || j.salary.max > 0))
    .map((j) => {
      const avg = j.salary.min && j.salary.max
        ? (j.salary.min + j.salary.max) / 2
        : j.salary.min || j.salary.max;
      const { currentCurrency } = appStore.getState();
      return convertCurrency(avg, j.salary.currency, currentCurrency, rates);
    })
    .filter((s) => s > 0);

  if (salaries.length > 0) {
    const { currentCurrency } = appStore.getState();
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

function syncAiSummaryUI(report) {
  if (!DOM.aiSummaryCard || !DOM.btnGenerateAiSummary || !DOM.btnUpdateAiSummary || !DOM.aiSummaryWarning) return;

  const { userSkills = [] } = appStore.getState();
  const hasSkills = userSkills.length > 0;

  if (!hasSkills) {
    DOM.btnGenerateAiSummary.style.display = 'none';
    DOM.btnUpdateAiSummary.style.display = 'none';
    DOM.aiSummaryWarning.style.display = 'none';
    if (DOM.aiSummaryPlaceholder) {
      DOM.aiSummaryPlaceholder.style.display = 'flex';
      if (DOM.aiSummaryPlaceholderText) {
        DOM.aiSummaryPlaceholderText.textContent = 'Добавьте свой стек навыков, чтобы ИИ проанализировал ваше соответствие рынку';
      }
    }
  } else {
    DOM.aiSummaryWarning.style.display = 'none';
    if (report.aiSummary) {
      DOM.btnGenerateAiSummary.style.display = 'none';
      DOM.btnUpdateAiSummary.style.display = 'inline-flex';
      if (DOM.aiSummaryPlaceholder) {
        DOM.aiSummaryPlaceholder.style.display = 'none';
      }
    } else {
      DOM.btnGenerateAiSummary.style.display = 'inline-flex';
      DOM.btnUpdateAiSummary.style.display = 'none';
      if (DOM.aiSummaryPlaceholder) {
        DOM.aiSummaryPlaceholder.style.display = 'flex';
        if (DOM.aiSummaryPlaceholderText) {
          DOM.aiSummaryPlaceholderText.textContent = 'Стек выбран! Запустите ИИ-анализ, чтобы составить персональный портрет соответствия';
        }
      }
    }
  }
}

let isJobMatchingInitialized = false;
let currentReport = null;
let currentRates = null;
let currentSortedSkills = [];
let showAllSkills = false;

function initJobMatching(report, rates) {
  if (!DOM.jobMatchingPanel) return;

  currentReport = report;
  currentRates = rates;

  const jobs = report.jobs || [];

  const allSkillsMap = {};
  jobs.forEach(job => {
    (job.skills || []).forEach(s => {
      const sLower = s.toLowerCase();
      if (!allSkillsMap[sLower]) {
        allSkillsMap[sLower] = { name: s, count: 0 };
      }
      allSkillsMap[sLower].count++;
    });
  });
  currentSortedSkills = Object.values(allSkillsMap).sort((a, b) => b.count - a.count);

  const renderUserSkills = () => {
    const { userSkills = [] } = appStore.getState();
    if (!DOM.userSkillsContainer) return;

    const countBadge = document.getElementById('userSkillsCount');
    if (countBadge) {
      countBadge.textContent = userSkills.length;
    }

    if (userSkills.length === 0) {
      DOM.userSkillsContainer.innerHTML = `<span class="job-matching-panel__empty-text">Вы еще не выбрали навыки. Выберите их из списка доступных ниже...</span>`;
    } else {
      DOM.userSkillsContainer.innerHTML = userSkills
        .map(skill => `
          <span class="user-stack-tag">
            <span>${escapeHtml(skill)}</span>
            <span class="user-stack-tag__remove" data-skill="${escapeHtml(skill)}">✕</span>
          </span>
        `).join('');
    }
  };

  const renderPopularSkills = () => {
    const { userSkills = [] } = appStore.getState();
    if (!DOM.popularSkillsContainer) return;

    // Фильтруем навыки: убираем те, что уже выбраны
    const availableSkills = currentSortedSkills.filter(
      skill => !userSkills.some(us => us.toLowerCase() === skill.name.toLowerCase())
    );

    const btnToggle = document.getElementById('btnToggleAllSkills');

    // Лимит для 2 строк на средних экранах ~15-20 навыков.
    // Если доступных навыков больше этого лимита, то показываем кнопку раскрытия.
    const limit = 20;
    const hasMore = availableSkills.length > limit;

    if (btnToggle) {
      if (hasMore) {
        btnToggle.style.display = 'inline-block';
        btnToggle.textContent = showAllSkills ? 'Свернуть' : 'Показать все';
      } else {
        btnToggle.style.display = 'none';
      }
    }

    // Переключаем CSS-класс свертывания для 2 линий
    if (showAllSkills) {
      DOM.popularSkillsContainer.classList.remove('collapsed');
    } else {
      DOM.popularSkillsContainer.classList.add('collapsed');
    }

    if (currentSortedSkills.length === 0) {
      DOM.popularSkillsContainer.innerHTML = `<span class="job-matching-panel__empty-text">В вакансиях этого отчёта не найдено ключевых технологий.</span>`;
    } else if (availableSkills.length === 0) {
      DOM.popularSkillsContainer.innerHTML = `<span class="job-matching-panel__empty-text">Все доступные навыки добавлены в ваш стек.</span>`;
    } else {
      DOM.popularSkillsContainer.innerHTML = availableSkills
        .map(skill => {
          return `<span class="popular-skill-tag" data-skill="${escapeHtml(skill.name)}">${escapeHtml(skill.name)} <small>(${skill.count})</small></span>`;
        })
        .join('');
    }
  };

  const toggleUserSkill = (skillName) => {
    let { userSkills = [] } = appStore.getState();
    const sLower = skillName.toLowerCase();
    const idx = userSkills.findIndex(s => s.toLowerCase() === sLower);

    if (idx !== -1) {
      userSkills = userSkills.filter((_, i) => i !== idx);
    } else {
      const exactSkill = currentSortedSkills.find(s => s.name.toLowerCase() === sLower);
      userSkills = [...userSkills, exactSkill ? exactSkill.name : skillName];
    }

    appStore.setState({ userSkills });
    renderUserSkills();
    renderPopularSkills();
    renderJobsTable(jobs, rates);
    syncAiSummaryUI(report);
  };

  if (!isJobMatchingInitialized) {
    isJobMatchingInitialized = true;

    if (DOM.popularSkillsContainer) {
      DOM.popularSkillsContainer.addEventListener('click', (e) => {
        const tag = e.target.closest('.popular-skill-tag');
        if (tag) {
          const skill = tag.dataset.skill;
          toggleUserSkill(skill);
        }
      });
    }

    if (DOM.userSkillsContainer) {
      DOM.userSkillsContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.user-stack-tag__remove');
        if (removeBtn) {
          const skill = removeBtn.dataset.skill;
          toggleUserSkill(skill);
        }
      });
    }

    const btnToggle = document.getElementById('btnToggleAllSkills');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        showAllSkills = !showAllSkills;
        renderPopularSkills();
      });
    }
  }

  renderUserSkills();
  renderPopularSkills();
}
