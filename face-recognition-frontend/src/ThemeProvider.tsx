import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ThemeContext } from './theme-context';
import type { AppTheme } from './theme-context';

const THEME_STORAGE_KEY = 'face-attendance-theme';

const getSystemTheme = (): AppTheme =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const getInitialTheme = (): AppTheme => {
    try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch (error) {
        console.warn('Theme preference is unavailable:', error);
    }

    return getSystemTheme();
};

const ThemeProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [theme, setTheme] = useState<AppTheme>(getInitialTheme);

    useLayoutEffect(() => {
        const root = document.documentElement;
        const themeColor = theme === 'dark' ? '#07111f' : '#edf7fb';

        root.dataset.theme = theme;
        root.style.colorScheme = theme;
        document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    }, [theme]);

    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;

            if (event.newValue === 'light' || event.newValue === 'dark') {
                setTheme(event.newValue);
            } else if (event.newValue === null) {
                setTheme(getSystemTheme());
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    useEffect(() => {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = (event: MediaQueryListEvent) => {
            try {
                const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
                if (savedTheme === 'light' || savedTheme === 'dark') return;
            } catch {
                // When storage is unavailable, continue following the system setting.
            }

            setTheme(event.matches ? 'dark' : 'light');
        };

        systemTheme.addEventListener('change', handleSystemThemeChange);
        return () => systemTheme.removeEventListener('change', handleSystemThemeChange);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme((currentTheme) => {
            const nextTheme: AppTheme = currentTheme === 'dark' ? 'light' : 'dark';

            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            } catch (error) {
                console.warn('Theme preference could not be saved:', error);
            }

            return nextTheme;
        });
    }, []);

    const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export default ThemeProvider;
