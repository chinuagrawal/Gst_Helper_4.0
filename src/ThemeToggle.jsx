import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('gst-helper-theme');
      if (saved) return saved === 'dark';
    } catch { /* use the system preference */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('gst-helper-theme', dark ? 'dark' : 'light'); } catch { /* keep the preference for this session */ }
  }, [dark]);
  return <button className="theme-toggle" onClick={() => setDark(value => !value)}
    aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark}>
    <span aria-hidden="true">{dark ? '☀' : '☾'}</span>{dark ? 'Light mode' : 'Dark mode'}
  </button>;
}
