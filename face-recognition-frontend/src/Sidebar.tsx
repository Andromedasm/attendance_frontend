import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import FaceRecognitionIcon from './FaceRecognitionIcon';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

const navigationSections = [
    {
        label: 'OVERVIEW',
        items: [{ to: '/', icon: 'fa-house', label: 'ホーム' }],
    },
    {
        label: 'REGISTER',
        items: [
            { to: '/capture', icon: 'fa-camera', label: '顔登録' },
            { to: '/re_register', icon: 'fa-rotate', label: '顔データ再登録' },
        ],
    },
    {
        label: 'VERIFY',
        items: [
            { to: '/verify', icon: 'fa-user-check', label: '顔認証' },
            { to: '/liveness', icon: 'fa-eye', label: 'ライブネスチェック' },
        ],
    },
    {
        label: 'SUPPORT',
        items: [{ to: '/manual', icon: 'fa-book-open', label: 'マニュアル' }],
    },
    {
        label: 'ATTENDANCE',
        items: [{ to: '/attendance', icon: 'fa-users-viewfinder', label: '出退勤' }],
    },
];

const Sidebar: React.FC = () => {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const closeSidebar = () => setIsSidebarOpen(false);

    useEffect(() => {
        if (!isSidebarOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeSidebar();
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isSidebarOpen]);

    return (
        <>
            <button
                type="button"
                className={`sidebar-toggle-button ${isSidebarOpen ? 'is-open' : ''}`}
                onClick={() => setIsSidebarOpen((open) => !open)}
                aria-label={isSidebarOpen ? 'メニューを閉じる' : 'メニューを開く'}
                aria-expanded={isSidebarOpen}
                aria-controls="application-sidebar"
            >
                <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true" />
            </button>

            <button
                type="button"
                className={`sidebar-backdrop ${isSidebarOpen ? 'is-visible' : ''}`}
                onClick={closeSidebar}
                aria-label="メニューを閉じる"
                tabIndex={isSidebarOpen ? 0 : -1}
            />

            <aside
                id="application-sidebar"
                className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
                aria-hidden={!isSidebarOpen}
            >
                <div className="sidebar-glow" aria-hidden="true" />
                <div className="sidebar-content">
                    <header className="sidebar-header">
                        <Link
                            to="/"
                            className="sidebar-brand"
                            onClick={closeSidebar}
                            tabIndex={isSidebarOpen ? undefined : -1}
                        >
                            <span className="sidebar-brand-icon">
                                <FaceRecognitionIcon className="size-6" />
                            </span>
                            <strong>Face Attendance</strong>
                        </Link>
                    </header>

                    <nav className="sidebar-nav" aria-label="メインメニュー">
                        {navigationSections.map((section) => (
                            <section key={section.label} className="sidebar-section">
                                <p className="menu-header">{section.label}</p>
                                <ul className="sidebar-menu-list">
                                    {section.items.map((item) => {
                                        const isActive = location.pathname === item.to;

                                        return (
                                            <li key={item.to}>
                                                <Link
                                                    to={item.to}
                                                    onClick={closeSidebar}
                                                    tabIndex={isSidebarOpen ? undefined : -1}
                                                    aria-current={isActive ? 'page' : undefined}
                                                    className={`sidebar-menu-item ${isActive ? 'active' : ''}`}
                                                >
                                                    <span className="sidebar-menu-icon">
                                                        <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                                                    </span>
                                                    <span>{item.label}</span>
                                                    <i className="fa-solid fa-chevron-right sidebar-menu-arrow" aria-hidden="true" />
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))}
                    </nav>

                    <footer className="sidebar-footer">
                        <span className="sidebar-status-dot" aria-hidden="true" />
                        <span>
                            <strong>TERMINAL READY</strong>
                            <small>顔認証サービス稼働中</small>
                        </span>
                    </footer>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
