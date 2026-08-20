// Abrir/cerrar el drawer de navegación móvil (hamburguesa). Autocontenido para
// poder usarse en páginas que no cargan home.js, como la ficha de evento.
// ponytail: home.js todavía tiene su propia copia inline de esta lógica;
// migrarla a este módulo cuando se toque.
export function setupMenuDrawer() {
  const drawer = document.querySelector('[data-menu-drawer]');
  if (!drawer) return;

  const open = () => {
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    drawer.hidden = true;
    document.body.style.overflow = '';
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-menu-open]')) {
      event.preventDefault();
      open();
      return;
    }
    if (event.target.closest('[data-menu-close]')) {
      event.preventDefault();
      close();
      return;
    }
    // Al navegar desde un enlace del drawer, ciérralo.
    if (event.target.closest('[data-menu-drawer] a[href]')) close();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer.hidden) close();
  });
}
