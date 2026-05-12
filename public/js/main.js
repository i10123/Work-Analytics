import { DOM } from './dom.js'; // Импорт объекта со всеми элементами интерфейса
import { initializeTheme } from './ui/theme.js'; // Функция инициализации цветовой темы
import { loadSettings } from './utils/settings.js'; // Функция загрузки настроек из памяти
import { setCurrentCurrency, currentReport } from './state.js'; // Переменные для работы с текущим состоянием (валюта, отчет)
import { loadReportsList, loadReportById } from './api.js'; // Запросы к серверу для получения списка отчетов
import { setupSSE } from './ui/sse.js'; // Настройка живого соединения с сервером (обновления в реальном времени)
import { openModal, closeModal, handleFormSubmit } from './ui/modal.js'; // Управление окном создания отчета
import { renderDashboard } from './ui/dashboard.js'; // Логика отрисовки графиков и таблиц
import { showScreen } from './ui/common.js'; // Вспомогательная функция для переключения экранов
import { setupSidebarListeners, loadQueueUI } from './ui/sidebar.js'; // Управление боковым меню и очередью задач
import { setupSettingsListeners, setupStepperListeners, setupSegmentedControlListeners } from './ui/settings.js'; // Управление настройками приложения
import { initializePremiumUI } from './ui/ui-premium.js'; // Активация красивых визуальных эффектов
import { setupWelcomeScreen, updateWelcomeStats } from './ui/welcome.js'; // Настройка стартового экрана

// ГЛАВНОЕ СОБЫТИЕ: Запуск кода сразу после загрузки HTML-структуры браузером
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Включаем визуальную тему (темная/светлая)
  initializeTheme();

  // 2. Настраиваем начальные элементы управления и загружаем интерфейс
  initializeSettings();
  initializePremiumUI();
  setupEventListeners(); // Вешаем обработчики на кнопки (что делать при клике)
  setupSSE(); // Начинаем слушать поток уведомлений от сервера
  setupWelcomeScreen(); // Готовим стартовый экран

  let isRestoredProgress = false; // Флажок: восстановили ли мы сейчас процесс парсинга после F5?

  // F5-СИНХРОНИЗАЦИЯ: Проверяем у сервера, не работает ли прямо сейчас сбор данных
  try {
    const queueRes = await fetch('/api/queue'); // Спрашиваем сервер про очередь задач
    const queueData = await queueRes.json(); // Переводим ответ в понятный для JS вид
    
    // Если сервер говорит, что задача сейчас выполняется (status === 'processing')
    if (queueData.success && queueData.currentTask && queueData.currentTask.status === 'processing') {
      showScreen('progress'); // Моментально переключаем пользователя на экран загрузки
      if (DOM.progressTitle)
        DOM.progressTitle.textContent = `Сбор данных: "${queueData.currentTask.query || ''}"`;
      isRestoredProgress = true; // Ставим галочку, что прогресс восстановлен
    }
  } catch (e) {
    console.warn('[App] ⚠️ Не удалось проверить состояние очереди:', e.message); // Если сервер не ответил, пишем предупреждение
  }

  // 3. Загружаем из базы данных список всех прошлых отчётов пользователя
  await loadReportsList();
  updateWelcomeStats(); // Обновляем цифры на главном экране (всего отчетов, всего вакансий)

  // 4. Загружаем визуальный блок очереди в боковой панели
  await loadQueueUI();

  // 5. РОУТИНГ (Навигация): Определяем, какой экран показать первым
  if (!isRestoredProgress) { // Если мы не на экране загрузки (пункт F5-синхронизация выше)
    const hash = window.location.hash; // Берем хвостик ссылки после знака #
    
    // Если в ссылке есть #report=ID, значит пользователь перешел по прямой ссылке на отчет
    if (hash && hash.startsWith('#report=')) {
      const reportId = hash.replace('#report=', ''); // Достаем ID
      loadReportById(reportId, true); // Скачиваем данные этого отчета и рисуем дашборд
    } else {
      // Если ссылки на отчет нет — показываем красивый стартовый (Welcome) экран
      showScreen('welcome');
      // Обновляем историю браузера, чтобы кнопка "Назад" работала корректно
      history.replaceState({ type: 'welcome' }, '', window.location.pathname);
    }
  }
});

// Функция, которая подставляет сохраненные в памяти настройки в формы на экране
function initializeSettings() {
  const settings = loadSettings(); // Читаем настройки из localStorage браузера
  
  setCurrentCurrency(settings.defaultCurrency); // Устанавливаем глобальную валюту приложения
  
  // Подсвечиваем активную кнопку валюты (USD/RUB/...) в интерфейсе
  DOM.currencyBtns?.forEach((b) => {
    b.classList.toggle('active', b.dataset.currency === settings.defaultCurrency);
  });
  
  // Прописываем в выпадающие списки сохраненные период поиска и лимит вакансий
  if (DOM.selectPeriod)
    DOM.selectPeriod.value = settings.defaultPeriod;
  if (DOM.inputLimit)
    DOM.inputLimit.value = settings.defaultLimit;
}

// Функция, которая обучает кнопки на сайте реагировать на действия пользователя
function setupEventListeners() {
  
  // Нажатие на "гамбургер" в сайдбаре — сворачивает или разворачивает левую панель
  DOM.sidebarToggle?.addEventListener('click', () => {
    DOM.sidebar?.classList.toggle('collapsed');
  });

  // Кнопка "Новый отчет" — открывает модальное окно
  DOM.btnNewReport?.addEventListener('click', openModal);

  // Кнопка "Назад на главный экран" внутри дашборда
  DOM.btnBackToWelcome?.addEventListener('click', () => {
    showScreen('welcome'); // Показать начальный экран
    history.pushState({ type: 'welcome' }, '', window.location.pathname); // Сохранить этот шаг в историю браузера
    // Снимаем выделение (активный класс) со всех отчетов в списке слева
    document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
  });

  // Следим за кнопками "Назад / Вперед" в самом браузере (мышка, стрелки браузера)
  window.addEventListener('popstate', (event) => {
    const state = event.state;
    // Если в истории записано, что мы были на отчете — открываем отчет
    if (state && state.type === 'report') {
      loadReportById(state.id, true);
    } else {
      // Иначе возвращаем на стартовый экран
      showScreen('welcome');
      document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
    }
  });

  // Закрытие модального окна по крестику или при клике в пустоту (оверлей)
  DOM.modalClose?.addEventListener('click', closeModal);
  DOM.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === DOM.modalOverlay) closeModal();
  });

  // Отправка формы создания отчета (клик "Начать поиск")
  DOM.parseForm?.addEventListener('submit', handleFormSubmit);

  // Переключатели валют на дашборде
  DOM.currencyBtns?.forEach((btn) => {
    btn.addEventListener('click', () => {
      setCurrentCurrency(btn.dataset.currency); // Меняем текущую валюту в памяти
      DOM.currencyBtns.forEach((b) => b.classList.remove('active')); // Снимаем подсветку со всех кнопок
      btn.classList.add('active'); // Подсвечиваем ту, на которую кликнули
      
      // Если на экране сейчас открыт отчет — ПЕРЕРИСОВЫВАЕМ графики с новыми валютными значениями
      if (currentReport) {
        renderDashboard(currentReport);
      }
      updateWelcomeStats(); // И обновляем цифры на главном экране
    });
  });

  // Мобильная версия: открытие боковой панели
  if (DOM.mobileMenuToggle) {
    DOM.mobileMenuToggle.addEventListener('click', () => {
      DOM.sidebar?.classList.toggle('open');
    });
  }

  // Мобильная версия: автоматическое закрытие сайдбара, если кликнули "мимо" него (на контент)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) { // Если ширина экрана как у телефона
      if (DOM.sidebar && DOM.mobileMenuToggle) {
        // Если кликнули вне сайдбара и не по кнопке открытия, и он сейчас открыт — закрываем
        if (!DOM.sidebar.contains(e.target) && !DOM.mobileMenuToggle.contains(e.target) && DOM.sidebar.classList.contains('open')) {
          DOM.sidebar.classList.remove('open');
        }
      }
    }
  });

  // Подключаем вспомогательные слушатели для настроек и логов
  setupSettingsListeners();
  setupStepperListeners();
  setupSegmentedControlListeners();
  setupSidebarListeners();

  // Сворачиваем блок технических логов в сайдбаре по умолчанию, чтобы не мешал при загрузке
  if (DOM.sidebarLogs)
    DOM.sidebarLogs.classList.add('collapsed');
}
