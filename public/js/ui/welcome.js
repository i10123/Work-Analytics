import { DOM } from '../dom.js';
import { appStore } from '../state.js';
import { getCurrencySymbol, convertCurrency } from '../utils/currency.js';
import { formatSalary } from '../utils/formatters.js';

export function setupWelcomeScreen() {
  setupCanvasBackground();
  setupTypewriter();
  setupQuickTags();
  setupSearchInput();
  setupTiltEffect();
  setupMarqueeObserver();
  updateWelcomeStats();
  setupQuickSearchPanelListeners();
}

function setupCanvasBackground() {
  const canvas = document.getElementById('welcomeCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  let time = 0;

  const waves = [
    { amplitude: 40, frequency: 0.003, speed: 0.015, color: 'rgba(0, 150, 255, 0.05)', lineWidth: 1 },
    { amplitude: 70, frequency: 0.002, speed: 0.01, color: 'rgba(0, 150, 255, 0.08)', lineWidth: 1.5 },
    { amplitude: 30, frequency: 0.004, speed: 0.02, color: 'rgba(255, 100, 100, 0.05)', lineWidth: 1 },
    { amplitude: 100, frequency: 0.0015, speed: 0.008, color: 'rgba(0, 200, 255, 0.06)', lineWidth: 2 }
  ];

  let mouseX = 0;
  let targetMouseX = 0;
  let mouseY = height / 2;

  const welcomeScreen = document.getElementById('welcomeScreen');
  if (welcomeScreen) {
    welcomeScreen.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });
    welcomeScreen.addEventListener('mouseleave', () => {
      targetMouseX = width / 2;
      mouseY = height / 2;
    });
  }

  targetMouseX = width / 2;

  let animationId;
  if (welcomeScreen) {
    const observer = new MutationObserver(() => {
      if (welcomeScreen.style.display === 'none') {
        cancelAnimationFrame(animationId);
      } else {
        cancelAnimationFrame(animationId);
        animate();
      }
    });
    observer.observe(welcomeScreen, { attributes: true, attributeFilter: ['style'] });
  }

  function drawWave(wave) {
    ctx.beginPath();

    mouseX += (targetMouseX - mouseX) * 0.05;

    const mouseInfluence = (mouseX / width) * 100;

    for (let x = 0; x <= width; x += 5) {
      let y = Math.sin(x * wave.frequency + time * wave.speed) * wave.amplitude;
      y += Math.cos(x * wave.frequency * 1.5 + time * wave.speed * 0.8) * (wave.amplitude * 0.5);

      const distanceFromCenter = Math.abs((height / 2) - y);
      const taper = 1 - Math.min(distanceFromCenter / (height * 0.8), 1);

      const verticalShift = (mouseY - height / 2) * 0.2;

      const finalY = (height / 2) + y * taper + verticalShift;

      if (x === 0) {
        ctx.moveTo(x, finalY);
      } else {
        ctx.lineTo(x, finalY);
      }
    }

    ctx.strokeStyle = wave.color;
    ctx.lineWidth = wave.lineWidth;
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, height / 2, 0, height);

    const baseColorMatch = wave.color.match(/rgba\((\d+,\s*\d+,\s*\d+)/);
    if (baseColorMatch) {
      const rgb = baseColorMatch[1];
      gradient.addColorStop(0, `rgba(${rgb}, 0.02)`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  function animate() {
    if (welcomeScreen && welcomeScreen.style.display === 'none') {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const bgGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.6);
    bgGradient.addColorStop(0, 'rgba(0, 150, 255, 0.03)');
    bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    waves.forEach(wave => drawWave(wave));

    time += 1;
    animationId = requestAnimationFrame(animate);
  }

  animate();
}

function setupTypewriter() {
  const input = document.getElementById('welcomeSearchInput');
  if (!input) return;

  const phrases = [
    'Поиск по: Frontend React',
    'Поиск по: Python Backend',
    'Поиск по: Java Spring',
    'Поиск по: Machine Learning',
    'Поиск по: Node.js Developer',
    'Поиск по: C# .NET',
    'Поиск по: QA Automation',
    'Поиск по: DevOps Engineer',
    'Поиск по: iOS Swift',
    'Поиск по: Data Analyst'
  ];

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typewriterTimeout = null;

  input.addEventListener('focus', () => {
    typewriterLoop();
  });

  input.addEventListener('blur', () => {
    setTimeout(typewriterLoop, 50);
  });

  input.addEventListener('input', () => {
    typewriterLoop();
  });

  function typewriterLoop() {
    clearTimeout(typewriterTimeout);

    const welcomeScreen = document.getElementById('welcomeScreen');
    const isWelcomeVisible = welcomeScreen && welcomeScreen.style.display !== 'none';
    const isFocused = document.activeElement === input;
    const hasValue = input.value.length > 0;

    if (!isWelcomeVisible) {
      typewriterTimeout = setTimeout(typewriterLoop, 1000);
      return;
    }

    if (isFocused) {
      input.setAttribute('placeholder', 'Введите запрос...');
      return;
    }

    if (hasValue) {
      input.setAttribute('placeholder', '');
      charIndex = 0;
      isDeleting = false;
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

    let typeSpeed = isDeleting ? 30 : 80;

    if (!isDeleting && charIndex === currentPhrase.length) {
      typeSpeed = 2500;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      typeSpeed = 500;
    }

    typewriterTimeout = setTimeout(typewriterLoop, typeSpeed);
  }

  const welcomeScreen = document.getElementById('welcomeScreen');
  if (welcomeScreen) {
    const observer = new MutationObserver(() => {
      if (welcomeScreen.style.display !== 'none') {
        typewriterLoop();
      }
    });
    observer.observe(welcomeScreen, { attributes: true, attributeFilter: ['style'] });
  }

  typewriterLoop();
}

function setupQuickTags() {
  const tags = document.querySelectorAll('.welcome-tag');
  const input = document.getElementById('welcomeSearchInput');
  const panel = document.getElementById('welcomeSearchPanel');
  tags.forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      const query = tag.dataset.query;
      if (input) {
        input.value = query;
        input.focus();
      }
      if (panel) {
        panel.classList.add('active');
      }
    });
  });
}

function setupSearchInput() {
  const input = document.getElementById('welcomeSearchInput');
  const submitBtn = document.getElementById('welcomeSearchSubmit');
  const form = document.getElementById('welcomeSearchForm');

  if (!input || !submitBtn || !form) return;

  const fillEmptyWithPlaceholder = () => {
    let val = input.value.trim();
    if (!val) {
      const ph = input.getAttribute('placeholder');
      if (ph && ph.startsWith('Поиск по: ')) {
        val = ph.replace('Поиск по: ', '');
        input.value = val;
      }
    }
  };

  form.addEventListener('submit', () => {
    fillEmptyWithPlaceholder();
  });

  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fillEmptyWithPlaceholder();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  });

  document.addEventListener('keydown', (e) => {
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen && welcomeScreen.style.display !== 'none') {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
      }
    }
  });
}

function setupQuickSearchPanelListeners() {
  const input = document.getElementById('welcomeSearchInput');
  const panel = document.getElementById('welcomeSearchPanel');
  const form = document.getElementById('welcomeSearchForm');

  if (!input || !panel || !form) return;

  input.addEventListener('focus', () => {
    panel.classList.add('active');
  });

  document.addEventListener('click', (e) => {
    if (form && !form.contains(e.target)) {
      panel.classList.remove('active');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      panel.classList.remove('active');
    }
  });
}

function setupTiltEffect() {
  const cards = document.querySelectorAll('.welcome-stat-card');

  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateY = ((x - centerX) / centerX) * 10;

      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = `rotateX(0deg) rotateY(0deg) translateY(0)`;
    });
  });
}

function animateValue(obj, start, end, duration, formatFn = null) {
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(easeProgress * (end - start) + start);

    obj.textContent = formatFn ? formatFn(current) : current;

    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.textContent = formatFn ? formatFn(end) : end;
    }
  };
  window.requestAnimationFrame(step);
}

export function updateWelcomeStats() {
  const reportsCountEl = document.getElementById('welcomeStatReports');
  const jobsCountEl = document.getElementById('welcomeStatJobs');
  const topTechEl = document.getElementById('welcomeStatTopTech');
  const avgSalaryEl = document.getElementById('welcomeStatAvgSalary');

  if (!reportsCountEl || !jobsCountEl || !topTechEl) return;

  const { allReports, currentCurrency } = appStore.getState();

  if (!allReports || allReports.length === 0) {
    reportsCountEl.textContent = '0';
    jobsCountEl.textContent = '0';
    topTechEl.textContent = 'Пока нет данных';
    if (avgSalaryEl) avgSalaryEl.textContent = '—';
    return;
  }

  const reportsCount = allReports.length;
  animateValue(reportsCountEl, 0, reportsCount, 1500);

  let totalJobs = 0;
  let allSalaries = [];

  let latestRates = { RUB: 1, USD: 93.5, EUR: 100.2, BYN: 28.5 };
  let latestTimestamp = 0;

  allReports.forEach(report => {
    if (report.exchangeRates) {
      const ts = report.exchangeRates.timestamp || (report.createdAt ? new Date(report.createdAt).getTime() : 0);
      if (ts >= latestTimestamp && report.exchangeRates.rates) {
        latestTimestamp = ts;
        latestRates = report.exchangeRates.rates;
      }
    }
  });

  allReports.forEach(report => {
    const count = report.stats?.totalFound || report.jobCount || 0;
    totalJobs += count;

    const rates = latestRates;
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
    } else if (report.stats && report.stats.avgSalaryNormalized) {
      const inCurrent = convertCurrency(report.stats.avgSalaryNormalized, 'BYN', currentCurrency, rates);
      if (inCurrent > 0) allSalaries.push(inCurrent);
    }
  });

  animateValue(jobsCountEl, 0, totalJobs, 2000);

  if (avgSalaryEl) {
    if (allSalaries.length > 0) {
      const globalAvg = Math.round(allSalaries.reduce((a, b) => a + b, 0) / allSalaries.length);
      const sym = getCurrencySymbol(currentCurrency);
      animateValue(avgSalaryEl, 0, globalAvg, 2000, (val) => `${formatSalary(val)} ${sym}`);
    } else {
      avgSalaryEl.textContent = '—';
    }
  }

  const querySalaries = {};
  allReports.forEach(report => {
    if (!report.query) return;
    if (!querySalaries[report.query]) {
      querySalaries[report.query] = [];
    }

    if (report.stats && typeof report.stats.avgSalaryNormalized === 'number' && report.stats.avgSalaryNormalized > 0) {
      querySalaries[report.query].push(report.stats.avgSalaryNormalized);
    } else if (report.jobs && Array.isArray(report.jobs)) {
      const rates = report.exchangeRates?.rates || latestRates;
      let sum = 0;
      let count = 0;
      report.jobs.forEach(j => {
        if (j.salary && (j.salary.min || j.salary.max)) {
          const avg = j.salary.min && j.salary.max
            ? (j.salary.min + j.salary.max) / 2
            : j.salary.min || j.salary.max;
          const inByn = convertCurrency(avg, j.salary.currency, 'BYN', rates);
          if (inByn > 0) {
            sum += inByn;
            count++;
          }
        }
      });
      if (count > 0) {
        querySalaries[report.query].push(Math.round(sum / count));
      }
    }
  });

  let maxAvgSalary = -1;
  let topQuery = 'Пока нет данных';

  for (const [query, salaries] of Object.entries(querySalaries)) {
    if (salaries.length > 0) {
      const avg = salaries.reduce((a, b) => a + b, 0) / salaries.length;
      if (avg > maxAvgSalary) {
        maxAvgSalary = avg;
        topQuery = query;
      }
    }
  }

  topTechEl.textContent = topQuery;
  topTechEl.title = topQuery;

  const topTechDupEl = document.getElementById('welcomeStatTopTechDup');
  const topTechWrapper = document.getElementById('welcomeStatTopTechWrapper');
  if (topTechDupEl) {
    topTechDupEl.textContent = topQuery;
  }
  
  adjustMarquee();
}

let marqueeObserver = null;

function setupMarqueeObserver() {
  const topTechWrapper = document.getElementById('welcomeStatTopTechWrapper');
  if (!topTechWrapper) return;

  if (marqueeObserver) {
    marqueeObserver.disconnect();
  }

  marqueeObserver = new ResizeObserver(() => {
    adjustMarquee();
  });
  
  marqueeObserver.observe(topTechWrapper);
}

export function adjustMarquee() {
  const topTechEl = document.getElementById('welcomeStatTopTech');
  const topTechWrapper = document.getElementById('welcomeStatTopTechWrapper');
  if (!topTechEl || !topTechWrapper) return;

  
  if (topTechWrapper.clientWidth === 0) return;

  
  const hadMarquee = topTechWrapper.classList.contains('has-marquee');
  topTechWrapper.classList.remove('has-marquee');

  const shouldScroll = topTechEl.scrollWidth > topTechWrapper.clientWidth;

  if (shouldScroll) {
    topTechWrapper.classList.add('has-marquee');
  } else if (hadMarquee) {
    topTechWrapper.classList.remove('has-marquee');
  }
}
