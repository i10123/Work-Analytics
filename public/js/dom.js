/**
 * Собирает все ссылки на HTML-элементы страницы через document.getElementById в один объект DOM.
 * Это позволяет избежать многократных поисков элементов в коде и упрощает поддержку имён идентификаторов.
 */

export const DOM = {
  // Сайдбар
  get sidebar() { return document.getElementById('sidebar'); },
  get sidebarToggle() { return document.getElementById('sidebarToggle'); },
  get btnNewReport() { return document.getElementById('btnNewReport'); },
  get reportsList() { return document.getElementById('reportsList'); },
  get reportsEmpty() { return document.getElementById('reportsEmpty'); },
  get reportsSearch() { return document.getElementById('reportsSearch'); },
  get queueStatus() { return document.getElementById('queueStatus'); },
  get queueText() { return document.getElementById('queueText'); },

  // Экраны
  get welcomeScreen() { return document.getElementById('welcomeScreen'); },
  get progressSection() { return document.getElementById('progressSection'); },
  get dashboard() { return document.getElementById('dashboard'); },

  // Модалка
  get modalOverlay() { return document.getElementById('modalOverlay'); },
  get modalClose() { return document.getElementById('modalClose'); },
  get parseForm() { return document.getElementById('parseForm'); },
  get inputQuery() { return document.getElementById('inputQuery'); },
  get inputLimit() { return document.getElementById('inputLimit'); },
  get btnSubmitParse() { return document.getElementById('btnSubmitParse'); },
  get parseSourceHH() { return document.getElementById('parseSourceHH'); },
  get parseSourceRabotaby() { return document.getElementById('parseSourceRabotaby'); },
  get parseSourceHabr() { return document.getElementById('parseSourceHabr'); },
  get parseDeepScrape() { return document.getElementById('parseDeepScrape'); },


  // Дашборд
  get btnExportCsv() { return document.getElementById('btnExportCsv'); },
  get btnStopParsing() { return document.getElementById('btnStopParsing'); },
  get progressTitle() { return document.getElementById('progressTitle'); },
  get progressStep() { return document.getElementById('progressStep'); },
  get progressTime() { return document.getElementById('progressTime'); },
  get progressFill() { return document.getElementById('progressFill'); },
  get btnBackToWelcome() { return document.getElementById('btnBackToWelcome'); },
  get dashTitle() { return document.getElementById('dashTitle'); },
  get dashSubtitle() { return document.getElementById('dashSubtitle'); },
  get alertPartial() { return document.getElementById('alertPartial'); },
  get alertPartialText() { return document.getElementById('alertPartialText'); },

  // AI Сводка
  get aiSummaryCard() { return document.getElementById('aiSummaryCard'); },
  get aiSummaryCardHeader() { return document.getElementById('aiSummaryCardHeader'); },
  get btnGenerateAiSummary() { return document.getElementById('btnGenerateAiSummary'); },
  get aiSummaryContent() { return document.getElementById('aiSummaryContent'); },
  get aiSummaryLoader() { return document.getElementById('aiSummaryLoader'); },
  get btnCollapseAiSummary() { return document.getElementById('btnCollapseAiSummary'); },
  get aiSummaryCollapseIcon() { return document.getElementById('aiSummaryCollapseIcon'); },

  // KPI
  get kpiTotal() { return document.getElementById('kpiTotal'); },
  get kpiNoSalary() { return document.getElementById('kpiNoSalary'); },
  get kpiAvgSalary() { return document.getElementById('kpiAvgSalary'); },
  get kpiMedianSalary() { return document.getElementById('kpiMedianSalary'); },
  get kpiCompanies() { return document.getElementById('kpiCompanies'); },
  get kpiRemote() { return document.getElementById('kpiRemote'); },

  // Валюты
  get currencyBtns() { return document.querySelectorAll('.currency-btn'); },

  // Таблица
  get jobsTableBody() { return document.getElementById('jobsTableBody'); },

  // Темы и мобильное меню
  get mobileMenuToggle() { return document.getElementById('mobileMenuToggle'); },

  // Настройки
  get btnSettings() { return document.getElementById('btnSettings'); },
  get settingsOverlay() { return document.getElementById('settingsOverlay'); },
  get settingsClose() { return document.getElementById('settingsClose'); },
  get settingsSave() { return document.getElementById('settingsSave'); },
  get confirmModal() { return document.getElementById('confirmModal'); },
  get confirmModalOverlay() { return document.getElementById('confirmModalOverlay'); },

  /** Элементы настроек */
  get settingsTabs() { return document.getElementById('settingsTabs'); },
  get settingsThemeGrid() { return document.getElementById('settingsThemeGrid'); },
  get settingsDefaultCurrency() { return document.getElementById('settingsDefaultCurrency'); },
  get settingsDefaultLimit() { return document.getElementById('settingsDefaultLimit'); },
  get settingsSourceHH() { return document.getElementById('settingsSourceHH'); },
  get settingsSourceRabotaby() { return document.getElementById('settingsSourceRabotaby'); },
  get settingsSourceHabr() { return document.getElementById('settingsSourceHabr'); },
  get groqStatusText() { return document.getElementById('groqStatusText'); },
  get currencyStatusText() { return document.getElementById('currencyStatusText'); },
  get dataReportsCount() { return document.getElementById('dataReportsCount'); },
  get dataJobsCount() { return document.getElementById('dataJobsCount'); },
  get btnDeleteAllReports() { return document.getElementById('btnDeleteAllReports'); },
  get btnClearCache() { return document.getElementById('btnClearCache'); },
  get btnResetSettings() { return document.getElementById('btnResetSettings'); },

};
