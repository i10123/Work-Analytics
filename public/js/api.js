import { DOM } from './dom.js';
import { escapeHtml } from './utils/formatters.js';
import { showScreen } from './ui/common.js';
import { renderDashboard } from './ui/dashboard.js';
import { setCurrentReport } from './state.js';
import { renderReportsList } from './ui/sidebar.js';

/**
 * Загружает список отчётов из API и рендерит сайдбар.
 */
export async function loadReportsList() {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (data.success) {
      renderReportsList(data.reports);
    }
  } catch (error) {
    console.error('[App] ❌ Ошибка загрузки списка отчётов:', error);
  }
}

/**
 * Загружает полный отчёт по ID и отображает дашборд.
 * @param {string} reportId — Идентификатор отчёта.
 */
export async function loadReportById(reportId) {
  try {
    const response = await fetch(`/api/reports/${reportId}`);
    const data = await response.json();

    if (data.success) {
      setCurrentReport(data.report);
      showScreen('dashboard');
      renderDashboard(data.report);

      /** Подсвечиваем активный отчёт в сайдбаре */
      document.querySelectorAll('.report-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === reportId);
      });
    }
  } catch (error) {
    console.error(`[App] ❌ Ошибка загрузки отчёта ${reportId}:`, error);
  }
}
