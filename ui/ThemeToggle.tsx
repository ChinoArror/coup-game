import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

const THEME_EVENT = 'coup-theme-change';

function isDark() {
  // Guard for server-side rendering in the Worker (seo.tsx renders Login/Rules/NotFound).
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/** Toggles the `dark` class on <html> and remembers the choice in localStorage ('coup_theme'). */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const sync = () => setDark(isDark());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  const toggle = () => {
    const next = !isDark();
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('coup_theme', next ? 'dark' : 'light'); } catch { /* Storage may be disabled. */ }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className={cn('text-muted-foreground hover:text-foreground', className)}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
