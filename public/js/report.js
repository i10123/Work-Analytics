/**
 * Модуль для взаимодействия с API отчетов и управления их жизненным циклом.
 * 
 * Функции:
 * - loadReportsList: Загружает полный список отчетов, обновляет состояние и боковую панель.
 * - loadReportById: Загружает детальную информацию об отчете, переключает экран на дашборд и рендерит данные.
 */

import { showScreen } from './ui/common.js';
import { renderDashboard } from './ui/dashboard.js';
import { appStore } from './state.js';
import { renderReportsList } from './ui/sidebar.js';

export async function loadReportsList() {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (data.success) {
      appStore.setState({ allReports: data.reports });
      renderReportsList(data.reports);
      return data.reports;
    }
    return [];
  } catch (error) {
    console.error('[App] ❌ Ошибка загрузки списка отчётов:', error);
    return [];
  }
}

export async function loadReportById(reportId, skipHistory = false) {
  try {
    const response = await fetch(`/api/reports/${reportId}`);
    const data = await response.json();

    if (data.success) {
      if (data.report && Array.isArray(data.report.jobs)) {
        data.report.jobs.forEach((job) => {
          if (Array.isArray(job.skills)) {
            job.skills = cleanSkills(job.skills);
          }
        });
      }

      appStore.setState({ currentReport: data.report });
      localStorage.setItem('lastReportId', reportId);

      if (!skipHistory) {
        history.pushState({ type: 'report', id: reportId }, '', `#report=${reportId}`);
      }

      showScreen('dashboard');
      renderDashboard(data.report);

      document.querySelectorAll('.report-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === reportId);
      });
    } else {
      localStorage.removeItem('lastReportId');
    }
  } catch (error) {
    console.error(`[App] ❌ Ошибка загрузки отчёта ${reportId}:`, error);
  }
}

function cleanSkills(skills) {
  if (!Array.isArray(skills) || skills.length <= 1) return skills || [];
  return skills.filter((skill, index) => {
    const strippedSkill = skill.replace(/\s+/g, '');
    const otherSkills = skills.filter((_, idx) => idx !== index);
    
    // Check if this skill is the concatenation of all other skills (or a subset of them)
    const concatOthersStripped = otherSkills.map(s => s.replace(/\s+/g, '')).join('');
    if (strippedSkill === concatOthersStripped) {
      return false;
    }
    
    // Fallback: if it's very long and contains multiple other skills as substrings
    if (skill.length > 30) {
      let containedCount = 0;
      let totalLengthOfContained = 0;
      for (const other of otherSkills) {
        if (other.length >= 3 && skill.includes(other)) {
          containedCount++;
          totalLengthOfContained += other.length;
        }
      }
      if (containedCount >= 3 && totalLengthOfContained >= skill.length * 0.8) {
        return false;
      }
    }
    
    return true;
  });
}
