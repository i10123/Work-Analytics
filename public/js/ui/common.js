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


  mainContent.addEventListener('scroll', () => {
    if (isRestoring) return;
    const key = getScrollKey();
    sessionStorage.setItem(key, mainContent.scrollTop);
  });


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


    mainContent.classList.add('scroll-restoring');
    mainContent.scrollTop = scrollTop;


    requestAnimationFrame(() => {
      mainContent.scrollTop = scrollTop;
    });


    setTimeout(() => {
      mainContent.scrollTop = scrollTop;
      isRestoring = false;


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
  if (screen === 'progress') {
    window.isProgressMinimized = false;
    sessionStorage.removeItem('isProgressMinimized');
  } else {
    window.isProgressMinimized = true;
    sessionStorage.setItem('isProgressMinimized', 'true');
  }

  if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = screen === 'welcome' ? 'flex' : 'none';
  if (DOM.progressSection) DOM.progressSection.style.display = screen === 'progress' ? 'flex' : 'none';
  if (DOM.dashboard) DOM.dashboard.style.display = screen === 'dashboard' ? 'block' : 'none';

  if (DOM.absoluteBack) {
    DOM.absoluteBack.style.display = screen === 'dashboard' ? 'flex' : 'none';
  }


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