

import { showScreen, showToast } from './ui/common.js';
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
      showToast(data.error || 'Не удалось загрузить отчёт', 'error');
    }
  } catch (error) {
    console.error(`[App] ❌ Ошибка загрузки отчёта ${reportId}:`, error);
    showToast(`Не удалось загрузить отчёт. Детали: ${error.message || error}`, 'error');
  }
}

function cleanSkills(skills) {
  if (!Array.isArray(skills) || skills.length <= 1) return skills || [];
  
  const strippedAll = skills.map(s => s.replace(/\s+/g, ''));
  const totalLength = strippedAll.reduce((sum, s) => sum + s.length, 0);

  return skills.filter((skill, index) => {
    const strippedSkill = strippedAll[index];
    
    
    if (strippedSkill.length === totalLength - strippedSkill.length) {
      const concatOthers = strippedAll.filter((_, idx) => idx !== index).join('');
      if (strippedSkill === concatOthers) {
        return false;
      }
    }
    
    
    if (skill.length > 30) {
      let containedCount = 0;
      let totalLengthOfContained = 0;
      for (let i = 0; i < skills.length; i++) {
        if (i === index) continue;
        const other = skills[i];
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
