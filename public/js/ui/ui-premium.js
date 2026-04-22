export function initializePremiumUI() {
  console.log('[UI] ✨ Инициализация премиальных эффектов...');
  setupCustomValidation();
  setupButtonEffects();
}

/**
 * Проверяет валидность формы и показывает кастомные тултипы.
 * @param {HTMLFormElement} form 
 * @returns {boolean}
 */
export function validateForm(form) {
  if (!form.checkValidity()) {
    const firstInvalid = form.querySelector(':invalid');
    if (firstInvalid) {
      showValidationTooltip(firstInvalid);
      firstInvalid.focus();
      // Добавляем эффект тряски
      firstInvalid.classList.add('shake');
      setTimeout(() => firstInvalid.classList.remove('shake'), 500);
    }
    return false;
  }
  return true;
}

/**
 * Настройка кастомной валидации для всех форм.
 */
function setupCustomValidation() {
  const forms = document.querySelectorAll('form');
  
  forms.forEach(form => {
    // Отключаем стандартные тултипы
    form.setAttribute('novalidate', '');
    
    form.addEventListener('invalid', (e) => {
      e.preventDefault();
      showValidationTooltip(e.target);
    }, true);
    
    // Очистка при вводе
    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('is-invalid')) {
        e.target.classList.remove('is-invalid');
        hideValidationTooltip(e.target);
      }
    });
  });
}

/**
 * Показывает стильный тултип вместо системного.
 */
function showValidationTooltip(input) {
  // Удаляем старый, если есть
  hideValidationTooltip(input);
  
  input.classList.add('is-invalid');
  
  const tooltip = document.createElement('div');
  tooltip.className = 'validation-tooltip';
  tooltip.id = `v-tooltip-${input.id}`;
  
  tooltip.innerHTML = `
    <span class="validation-tooltip__icon">!</span>
    <span class="validation-tooltip__text">${input.validationMessage}</span>
  `;
  
  document.body.appendChild(tooltip);
  
  const rect = input.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Позиционируем над инпутом
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.top - tooltipRect.height - 12 + window.scrollY}px`;
  
  // Авто-скрытие через 3 секунды
  setTimeout(() => hideValidationTooltip(input), 3000);
}

/**
 * Скрывает тултип с анимацией.
 */
function hideValidationTooltip(input) {
  const tooltip = document.getElementById(`v-tooltip-${input.id}`);
  if (tooltip) {
    tooltip.classList.add('validation-tooltip--exit');
    setTimeout(() => tooltip.remove(), 200);
  }
}

/**
 * Дополнительные визуальные эффекты для кнопок.
 */
function setupButtonEffects() {
  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.btn');
    if (btn) {
      btn.style.transform = 'scale(0.96)';
    }
  });
  
  document.addEventListener('mouseup', (e) => {
    const btn = e.target.closest('.btn');
    if (btn) {
      btn.style.transform = '';
    }
  });

  // Эффект "магнитного" свечения для KPI карточек (опционально)
  const cards = document.querySelectorAll('.kpi-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}
