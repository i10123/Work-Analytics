class Store {
  constructor(initialState) {
    this.state = initialState;
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);

    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const appStore = new Store({
  currentReport: null,
  currentCurrency: 'BYN',
  baselineSettings: null,
  allReports: [],
  userSkills: [],
});

export const charts = {
  salary: null,
  skills: null,
  salaryVsExp: null,
  workFormatDoughnut: null,
  workFormatBar: null,
  englishSalary: null,
  techCategory: null,
};

export const clientId = (() => {
  let id = sessionStorage.getItem('clientId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem('clientId', id);
  }
  return id;
})();