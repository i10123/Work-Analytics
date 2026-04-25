import { DOM } from '../dom.js';
import { allReports, currentCurrency } from '../state.js';
import { openModal } from './modal.js';
import { getCurrencySymbol, convertCurrency } from '../utils/currency.js';
import { formatSalary } from '../utils/formatters.js';

export function setupWelcomeScreen() {
  setupTypewriter();
  setupQuickTags();
  setupSearchInput();
  setupTiltEffect();
  updateWelcomeStats();
}

/**
 * Typewriter effect for search input placeholder
 */
function setupTypewriter() {
  const input = document.getElementById('welcomeSearchInput');
  if (!input) return;

  const phrases = [
    'Frontend React',
    'Python Backend',
    'DevOps Engineer',
    'Machine Learning',
    'Golang Developer',
    'Rust Backend'
  ];
  
  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let isPaused = false;
  let typewriterTimeout = null;

  input.addEventListener('focus', () => {
    isPaused = true;
    input.setAttribute('placeholder', '');
  });

  input.addEventListener('blur', () => {
    isPaused = false;
    if (!input.value) {
      typewriterLoop();
    }
  });

  function typewriterLoop() {
    if (isPaused) return;
    
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen && welcomeScreen.style.display === 'none') {
      clearTimeout(typewriterTimeout);
      typewriterTimeout = setTimeout(typewriterLoop, 1000);
      return;
    }

    const currentPhrase = phrases[phraseIndex];
    
    if (isDeleting) {
      input.setAttribute('placeholder', currentPhrase.substring(0, charIndex - 1));
      charIndex--;
    } else {
      input.setAttribute('placeholder', currentPhrase.substring(0, charIndex + 1));
      charIndex++;
    }

    let typeSpeed = isDeleting ? 50 : 100;

    if (!isDeleting && charIndex === currentPhrase.length) {
      typeSpeed = 2000; // Пауза в конце слова
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      typeSpeed = 500; // Пауза перед новым словом
    }

    clearTimeout(typewriterTimeout);
    typewriterTimeout = setTimeout(typewriterLoop, typeSpeed);
  }

  typewriterLoop();
}

/**
 * Setup Quick Tags click handlers
 */
function setupQuickTags() {
  const tags = document.querySelectorAll('.welcome-tag');
  tags.forEach(tag => {
    tag.addEventListener('click', () => {
      const query = tag.dataset.query;
      triggerSearch(query);
    });
  });
}

/**
 * Setup central search input enter key
 */
function setupSearchInput() {
  const input = document.getElementById('welcomeSearchInput');
  const submitBtn = document.getElementById('welcomeSearchSubmit');
  
  if (!input || !submitBtn) return;

  const handleSearch = () => {
    const val = input.value.trim() || input.getAttribute('placeholder');
    if (val) triggerSearch(val);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  });

  submitBtn.addEventListener('click', handleSearch);
}

function triggerSearch(query) {
  openModal(query);
}

/**
 * 3D Tilt effect for stat cards
 */
function setupTiltEffect() {
  const cards = document.querySelectorAll('.welcome-stat-card');
  
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -10; // Max rotation 10deg
      const rotateY = ((x - centerX) / centerX) * 10;
      
      card.style.setProperty('--rotate-x', `${rotateX}deg`);
      card.style.setProperty('--rotate-y', `${rotateY}deg`);
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--rotate-x', '0deg');
      card.style.setProperty('--rotate-y', '0deg');
    });
  });
}

/**
 * Calculate and display global stats based on reports history
 */
export function updateWelcomeStats() {
  const reportsCountEl = document.getElementById('welcomeStatReports');
  const jobsCountEl = document.getElementById('welcomeStatJobs');
  const topTechEl = document.getElementById('welcomeStatTopTech');
  const avgSalaryEl = document.getElementById('welcomeStatAvgSalary');
  
  if (!reportsCountEl || !jobsCountEl || !topTechEl) return;

  if (!allReports || allReports.length === 0) {
    reportsCountEl.textContent = '0';
    jobsCountEl.textContent = '0';
    topTechEl.textContent = 'Пока нет данных';
    if (avgSalaryEl) avgSalaryEl.textContent = '—';
    return;
  }

  // Общее количество отчётов
  reportsCountEl.textContent = allReports.length;

  // Общее количество вакансий во всех отчётах
  let totalJobs = 0;
  let allSalaries = [];

  allReports.forEach(report => {
    // 1) ИСПОЛЬЗУЕМ stats.totalFound
    const count = report.stats?.totalFound || report.jobCount || 0;
    totalJobs += count;

    // Сбор зарплат для средней (с конвертацией)
    const rates = report.exchangeRates?.rates || { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };
    if (report.jobs && Array.isArray(report.jobs)) {
      report.jobs.forEach(j => {
        if (j.salary && (j.salary.min || j.salary.max)) {
          const avg = j.salary.min && j.salary.max
            ? (j.salary.min + j.salary.max) / 2
            : j.salary.min || j.salary.max;
          const inCurrent = convertCurrency(avg, j.salary.currency, currentCurrency, rates);
          if (inCurrent > 0) allSalaries.push(inCurrent);
        }
      });
    }
  });

  jobsCountEl.textContent = totalJobs;

  if (avgSalaryEl) {
    if (allSalaries.length > 0) {
      const globalAvg = Math.round(allSalaries.reduce((a, b) => a + b, 0) / allSalaries.length);
      const sym = getCurrencySymbol(currentCurrency);
      avgSalaryEl.textContent = `${formatSalary(globalAvg)} ${sym}`;
    } else {
      avgSalaryEl.textContent = '—';
    }
  }

  // Топ технология (частота query с учетом регистра)
  const queryCounts = {};
  allReports.forEach(report => {
    if (report.query) {
      queryCounts[report.query] = (queryCounts[report.query] || 0) + 1;
    }
  });

  let maxCount = 0;
  let topQuery = 'Пока нет данных';

  for (const [query, count] of Object.entries(queryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topQuery = query;
    }
  }

  topTechEl.textContent = topQuery;
}
