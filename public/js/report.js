/**
 * Модуль для взаимодействия с API отчетов и управления их жизненным циклом.
 * 
 * Функции:
 * - loadReportsList: Загружает полный список отчетов, обновляет состояние и боковую панель.
 * - loadReportById: Загружает детальную информацию об отчете, переключает экран на дашборд и рендерит данные.
 */

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
      showScreen('welcome');
      history.replaceState({ type: 'welcome' }, '', window.location.pathname);
      showToast('Отчёт не найден', 'error');
    }
  } catch (error) {
    console.error(`[App] ❌ Ошибка загрузки отчёта ${reportId}:`, error);
    showScreen('welcome');
    history.replaceState({ type: 'welcome' }, '', window.location.pathname);
    showToast('Ошибка загрузки отчёта', 'error');
  }
}
