import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

const KEY = 'vaxtrack.theme';
const ThemeContext = createContext(null);

const readPref = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
};
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(readPref);
  const [systemIsDark, setSystemIsDark] = useState(systemDark);

  // follow the operating system while the preference is "system"
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemIsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = pref === 'system' ? (systemIsDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setPref = useCallback((next) => {
    setPrefState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: the choice lasts until reload */
    }
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Light / System / Dark segmented control */
export function ThemeToggle({ className = '' }) {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour theme" className={`inline-flex rounded-lg border border-line bg-subtle p-0.5 ${className}`}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setPref(value)}
            className={`flex size-9 items-center justify-center rounded-md transition-colors ${
              active ? 'bg-surface text-primary-ink shadow-card' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
