import { createContext, useContext } from 'react';

export type AppTheme = 'light' | 'dark';

export interface ThemeContextValue {
    theme: AppTheme;
    toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }

    return context;
};
