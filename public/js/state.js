class Store {
  constructor(initialState) {
    this.state = initialState;
    this.listeners = new Set();
  }

  // Получение текущего состояния хранилища (state)
  getState() {
    return this.state;
  }

  // Частичное обновление состояния с уведомлением всех подписанных слушателей
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  // Подписка функции-слушателя на изменения состояния с мгновенным начальным вызовом
  subscribe(listener) {
    this.listeners.add(listener);

    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  // Оповещение всех активных слушателей о произошедшем изменении состояния
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

// Генерация или получение из sessionStorage уникального ID сессии браузера для привязки SSE-событий
export const clientId = (() => {
  let id = sessionStorage.getItem('clientId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem('clientId', id);
  }
  return id;
})();