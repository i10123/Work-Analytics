export let currentReport = null;
export function setCurrentReport(report) { currentReport = report; }

export let currentCurrency = 'RUB';
export function setCurrentCurrency(currency) { currentCurrency = currency; }

export const charts = {
  salary: null,
  skills: null,
  salaryVsExp: null,
  workFormatDoughnut: null,
  workFormatBar: null,
  englishSalary: null,
  techCategory: null,
  dynamics: null,
};

export let baselineSettings = null;
export function setBaselineSettings(settings) { baselineSettings = settings; }

export let allReports = [];
export function setAllReports(reports) { allReports = reports; }