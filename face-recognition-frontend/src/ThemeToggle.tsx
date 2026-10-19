import React from 'react';
import { useTheme } from './theme-context';

const ThemeToggle: React.FC = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            className="theme-toggle-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'ライトモードに切り替える' : 'ダークモードに切り替える'}
            aria-pressed={theme === 'dark'}
        >
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" />
        </button>
    );
};

export default ThemeToggle;
