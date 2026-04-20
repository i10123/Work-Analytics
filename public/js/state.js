export let currentReport = null;
export function setCurrentReport(report) { currentReport = report; }

export let currentCurrency = 'RUB';
export function setCurrentCurrency(currency) { currentCurrency = currency; }

export const charts = {
  salary: null,
  sources: null,
  skills: null,
  experience: null,
  cities: null,
};

export let baselineSettings = null;
export function setBaselineSettings(settings) { baselineSettings = settings; }
