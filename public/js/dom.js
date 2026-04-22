export const DOM = {
  /* Сайдбар */
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  btnNewReport: document.getElementById('btnNewReport'),
  reportsList: document.getElementById('reportsList'),
  reportsEmpty: document.getElementById('reportsEmpty'),
  queueStatus: document.getElementById('queueStatus'),
  queueText: document.getElementById('queueText'),
  sidebarLogs: document.getElementById('sidebarLogs'),
  logsToggle: document.getElementById('logsToggle'),
  logsContainer: document.getElementById('logsContainer'),

  /* Экраны */
  welcomeScreen: document.getElementById('welcomeScreen'),
  progressSection: document.getElementById('progressSection'),
  dashboard: document.getElementById('dashboard'),

  /* Модалка */
  modalOverlay: document.getElementById('modalOverlay'),
  modalClose: document.getElementById('modalClose'),
  parseForm: document.getElementById('parseForm'),
  inputQuery: document.getElementById('inputQuery'),
  selectPeriod: document.getElementById('selectPeriod'),
  inputLimit: document.getElementById('inputLimit'),
  btnSubmitParse: document.getElementById('btnSubmitParse'),

  /* Чарты */
  chartWorkFormat: document.getElementById('chartWorkFormat'),
  chartSalaryByFormat: document.getElementById('chartSalaryByFormat'),

  /* Прогресс */
  progressTitle: document.getElementById('progressTitle'),
  progressStep: document.getElementById('progressStep'),

  /* Дашборд */
  dashTitle: document.getElementById('dashTitle'),
  dashSubtitle: document.getElementById('dashSubtitle'),
  alertPartial: document.getElementById('alertPartial'),
  alertPartialText: document.getElementById('alertPartialText'),

  /* KPI */
  kpiTotal: document.getElementById('kpiTotal'),
  kpiAvgSalary: document.getElementById('kpiAvgSalary'),
  kpiMedianSalary: document.getElementById('kpiMedianSalary'),
  kpiCompanies: document.getElementById('kpiCompanies'),
  kpiRemote: document.getElementById('kpiRemote'),

  /* Валюты */
  currencyBtns: document.querySelectorAll('.currency-btn'),

  /* Таблица */
  jobsTableBody: document.getElementById('jobsTableBody'),

  /* Темы и мобильное меню */
  mobileMenuToggle: document.getElementById('mobileMenuToggle'),

  /* Настройки */
  btnSettings: document.getElementById('btnSettings'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsClose: document.getElementById('settingsClose'),
  settingsSave: document.getElementById('settingsSave'),
  confirmModal: document.getElementById('confirmModal'),
  confirmModalOverlay: document.getElementById('confirmModalOverlay'),
  btnConfirmSave: document.getElementById('btnConfirmSave'),
  btnConfirmDiscard: document.getElementById('btnConfirmDiscard'),
  btnConfirmCancel: document.getElementById('btnConfirmCancel'),

  /** Элементы настроек */
  settingsTabs: document.getElementById('settingsTabs'),
  settingsThemeGrid: document.getElementById('settingsThemeGrid'),
  settingsDefaultCurrency: document.getElementById('settingsDefaultCurrency'),
  settingsDefaultPeriod: document.getElementById('settingsDefaultPeriod'),
  settingsDefaultLimit: document.getElementById('settingsDefaultLimit'),
  settingsSourceHH: document.getElementById('settingsSourceHH'),
  settingsSourceRabotaby: document.getElementById('settingsSourceRabotaby'),
  settingsSourceHabr: document.getElementById('settingsSourceHabr'),
  geminiStatusText: document.getElementById('geminiStatusText'),
  geminiKeysCount: document.getElementById('geminiKeysCount'),
  currencyStatusText: document.getElementById('currencyStatusText'),
  dataReportsCount: document.getElementById('dataReportsCount'),
  dataJobsCount: document.getElementById('dataJobsCount'),
  btnDeleteAllReports: document.getElementById('btnDeleteAllReports'),
  btnClearCache: document.getElementById('btnClearCache'),
  btnResetSettings: document.getElementById('btnResetSettings'),

  /* Модалка ошибки */
  errorModalOverlay: document.getElementById('errorModalOverlay'),
  errorTitle: document.getElementById('errorTitle'),
  errorText: document.getElementById('errorText'),
  btnErrorOk: document.getElementById('btnErrorOk'),
};
