/**
 * common.js
 * Суть: Вспомогательные утилиты для работы с интерфейсом.
 * Что делает: Обеспечивает базовую функциональность переключения экранов приложения и отображения уведомлений (тостов).
 * Что содержит: Функции showScreen для навигации между разделами и showToast для вывода сообщений.
 */
import { DOM } from '../dom.js';
import { escapeHtml } from '../utils/formatters.js';

let isRestoring = false;

function getScrollKey(screen) {
  if (screen === 'dashboard') {
    return 'scroll_' + (window.location.hash || 'welcome');
  }
  if (screen) {
    return 'scroll_' + screen;
  }
  return 'scroll_' + (window.location.hash || 'welcome');
}

export function initScrollRestoration() {
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  // Intercept pushState to clear scroll positions on new forward navigations
  const originalPushState = history.pushState;
  history.pushState = function (state, title, url) {
    let target = 'scroll_welcome';
    if (url) {
      if (url.includes('#report=')) {
        target = 'scroll_' + url.substring(url.indexOf('#report='));
      } else {
        target = 'scroll_welcome';
      }
    }
    sessionStorage.removeItem(target);
    return originalPushState.apply(this, arguments);
  };

  // Listen to scroll events to save scroll position
  mainContent.addEventListener('scroll', () => {
    if (isRestoring) return;
    const key = getScrollKey();
    sessionStorage.setItem(key, mainContent.scrollTop);
  });

  // Save scroll position on beforeunload just to be absolutely sure
  window.addEventListener('beforeunload', () => {
    const key = getScrollKey();
    sessionStorage.setItem(key, mainContent.scrollTop);
  });
}

export function restoreScrollPosition(screen) {
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  const key = getScrollKey(screen);
  const saved = sessionStorage.getItem(key);

  isRestoring = true;

  if (saved !== null) {
    const scrollTop = parseInt(saved, 10);

    // Instantly hide content during scroll restoration to prevent visual "jumps"
    mainContent.classList.add('scroll-restoring');
    mainContent.scrollTop = scrollTop;

    // Use requestAnimationFrame to make sure the scroll is applied after current rendering cycle
    requestAnimationFrame(() => {
      mainContent.scrollTop = scrollTop;
    });

    // Use 120ms to allow complex structures like tables & canvas charts to settle, then show
    setTimeout(() => {
      mainContent.scrollTop = scrollTop;
      isRestoring = false;
      
      // Let it fade back in smoothly with opacity transition
      mainContent.classList.remove('scroll-restoring');
    }, 120);
  } else {
    mainContent.scrollTop = 0;
    setTimeout(() => {
      isRestoring = false;
    }, 50);
  }
}

export function showScreen(screen) {
  if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = screen === 'welcome' ? 'flex' : 'none';
  if (DOM.progressSection) DOM.progressSection.style.display = screen === 'progress' ? 'flex' : 'none';
  if (DOM.dashboard) DOM.dashboard.style.display = screen === 'dashboard' ? 'block' : 'none';

  // Hide the initial page boot loader overlay with a smooth fade out
  const pageLoader = document.getElementById('pageLoader');
  if (pageLoader && !pageLoader.classList.contains('page-loader--hidden')) {
    pageLoader.classList.add('page-loader--hidden');
    setTimeout(() => {
      pageLoader.style.display = 'none';
    }, 300);
  }

  if (screen !== 'dashboard') {
    restoreScrollPosition(screen);
  }
}

export function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${type === 'success' ? '✅' : '❌'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
