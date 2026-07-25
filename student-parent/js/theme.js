// student-parent/js/theme.js - Dark / Light theme persistence

const Theme = {
  _key: 'sal_theme',

  init() {
    const saved = localStorage.getItem(this._key) || localStorage.getItem('student_theme') || 'light';
    this._apply(saved);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    this._apply(next);
    UI.toast(next === 'dark' ? '🌙 Dark mode on' : '☀️ Light mode on', 'info', 2000);
  },

  _apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(this._key, t);
    localStorage.setItem('student_theme', t);
    document.querySelectorAll('#theme-toggle').forEach(btn => {
      btn.textContent = t === 'dark' ? '☀️' : '🌙';
    });
  },
};
