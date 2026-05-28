export function initializePremiumUI() {
  console.log('[UI] ✨ Инициализация премиальных эффектов...');
  setupCustomValidation();
}

export function validateForm(form) {
  if (!form.checkValidity()) {
    const firstInvalid = form.querySelector(':invalid');
    if (firstInvalid) {
      showValidationTooltip(firstInvalid);
      firstInvalid.focus();

      firstInvalid.classList.add('shake');
      setTimeout(() => firstInvalid.classList.remove('shake'), 500);
    }
    return false;
  }
  return true;
}

function setupCustomValidation() {
  const forms = document.querySelectorAll('form');

  forms.forEach(form => {
    form.setAttribute('novalidate', '');

    form.addEventListener('invalid', (e) => {
      e.preventDefault();
      showValidationTooltip(e.target);
    }, true);

    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('is-invalid')) {
        e.target.classList.remove('is-invalid');
        hideValidationTooltip(e.target);
      }
    });
  });
}

export function showValidationTooltip(input) {
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

  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.top - tooltipRect.height - 12 + window.scrollY}px`;

  setTimeout(() => hideValidationTooltip(input), 3000);
}

function hideValidationTooltip(input) {
  const tooltip = document.getElementById(`v-tooltip-${input.id}`);
  if (tooltip) {
    tooltip.classList.add('validation-tooltip--exit');
    setTimeout(() => tooltip.remove(), 200);
  }
}