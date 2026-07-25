// teacher/js/theme.js - Dark / Light Theme Toggle & Persistence

const Theme = {
  _current: localStorage.getItem('sal_theme') || localStorage.getItem('hatTheme') || 'light',

  apply(t) {
    this._current = t;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('sal_theme', t);
    localStorage.setItem('hatTheme', t);
    const icon  = t === 'dark' ? '☀️' : '🌙';
    const label = t === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    const btn   = document.getElementById('themeBtn');
    const btnSb = document.getElementById('themeBtnSidebar');
    if (btn)   btn.textContent   = icon;
    if (btnSb) btnSb.textContent = label;
  },

  toggle() {
    this.apply(this._current === 'dark' ? 'light' : 'dark');
    UI.toast('Theme: ' + (this._current === 'dark' ? 'Dark 🌙' : 'Light ☀️'));
  },

  init() { this.apply(this._current); },
};

function toggleTheme() { Theme.toggle(); }
