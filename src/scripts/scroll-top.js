const button = document.querySelector('[data-scroll-top]');

if (button) {
  let framePending = false;

  const getScrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

  const updateVisibility = () => {
    const threshold = Math.max(180, window.innerHeight * 0.35);
    const visible = getScrollTop() > threshold;
    button.classList.toggle('is-hidden', !visible);
    button.setAttribute('aria-hidden', String(!visible));
    button.tabIndex = visible ? 0 : -1;
    framePending = false;
  };

  const scheduleVisibilityUpdate = () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updateVisibility);
  };

  window.addEventListener('scroll', scheduleVisibilityUpdate, { passive: true });
  window.addEventListener('resize', scheduleVisibilityUpdate, { passive: true });
  button.addEventListener('click', () => {
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  });

  updateVisibility();
}
