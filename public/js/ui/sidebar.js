import { DOM } from '../dom.js';
import { escapeHtml } from '../utils/formatters.js';
import { loadReportById } from '../api.js';

/**
 * Рендерит список отчётов в боковой панели.
 * @param {Array<Object>} reports — Массив метаданных отчётов.
 */
export function renderReportsList(reports) {
  if (!DOM.reportsEmpty || !DOM.reportsList) return;

  if (reports.length === 0) {
    DOM.reportsEmpty.style.display = 'block';
    return;
  }

  DOM.reportsEmpty.style.display = 'none';

  /** Очищаем список (оставляя пустой блок) */
  const items = DOM.reportsList.querySelectorAll('.report-item');
  items.forEach((el) => el.remove());

  reports.forEach((report) => {
    const div = document.createElement('div');
    div.className = 'report-item';
    div.dataset.id = report.id;

    const statusClass = `report-item__status--${report.status}`;
    const statusText = {
      completed: 'Готово',
      partial: 'Частично',
      failed: 'Ошибка',
    }[report.status] || report.status;

    const date = new Date(report.createdAt).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    div.innerHTML = `
      <div class="report-item__query" style="display:flex; align-items:center; gap:6px;">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        ${escapeHtml(report.query)}
      </div>
      <div class="report-item__meta">
        <span>${date} · ${report.stats?.totalFound || 0} вак.</span>
        <span class="report-item__status ${statusClass}">${statusText}</span>
      </div>
    `;

    div.addEventListener('click', () => loadReportById(report.id));

    DOM.reportsList.insertBefore(div, DOM.reportsEmpty);
  });
}
