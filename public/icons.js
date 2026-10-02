(() => {
  const icon = body => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  window.PARAGON_ICONS = Object.freeze({
    logo: '<svg class="brand-symbol" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M3 15 16 4l13 11v8L16 12 3 23z" fill="currentColor"/><path d="m3 27 13-11 13 11v7L16 23 3 34z" fill="currentColor" opacity=".45"/></svg>',
    arrow: icon('<path d="m6 18 11-11M7 7h10v10"/><path d="m4 14 6 6"/>'),
    stack: icon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="6" height="7" rx="1.5"/><rect x="4" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>'),
    bag: icon('<path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    bolt: icon('<path d="m13 3-8 10h6l-1 8 9-11h-6l1-7Z"/>'),
    close: icon('<path d="m6 6 12 12M18 6 6 18"/>'),
    check: icon('<path d="m5 12 4 4L19 6"/>'),
    sound: icon('<path d="m11 5-6 5H2v4h3l6 5V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>'),
    soundOff: icon('<path d="m11 5-6 5H2v4h3l6 5V5Z"/><path d="m16 9 6 6M22 9l-6 6"/>'),
    settings: icon('<path d="m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1V3Z" transform="translate(1 0) scale(.92)"/><circle cx="12" cy="12" r="3"/>'),
    chevrons: icon('<path d="m6 13 6-6 6 6M6 19l6-6 6 6"/>'),
    sortUp: icon('<path d="M8 19V5m-4 4 4-4 4 4M16 6h4M16 12h3M16 18h2"/>'),
    sortDown: icon('<path d="M8 5v14m-4-4 4 4 4-4M16 6h4M16 12h3M16 18h2"/>'),
    search: icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'),
    left: icon('<path d="m14 6-6 6 6 6"/>'),
    right: icon('<path d="m10 6 6 6-6 6"/>')
  });
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = window.PARAGON_ICONS[el.dataset.icon] || ''; });
})();