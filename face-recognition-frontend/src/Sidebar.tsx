import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

const Sidebar: React.FC = () => {
    const location = useLocation();
    const [activeItem, setActiveItem] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        setActiveItem(location.pathname);
    }, [location]);

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
    };

    return (
        <>
            <div className="sidebar-toggle-button" onClick={toggleSidebar}>
                <i className="fas fa-bars"></i>
            </div>
            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`} onClick={closeSidebar}>
                <div className="px-5 py-6" onClick={(e) => e.stopPropagation()}>
                    <h1 className="text-xl font-bold text-center mb-4 sidebar-title">顔認証システム</h1>
                    <ul className="space-y-1">
                        <li className="menu-header"><span>REGISTER</span></li>
                        <li>
                            <Link
                                to="/capture"
                                className={`flex items-center p-3 menu-item rounded relative ${
                                    activeItem === '/capture' ? 'active' : 'text-gray-700'
                                }`}
                            >
                                <i className="fas fa-camera fa-lg mr-3"></i>
                                顔登録
                            </Link>
                        </li>
                        <li>
                            <Link
                                to="/re_register"
                                className={`flex items-center p-3 menu-item rounded relative ${
                                    activeItem === '/re_register' ? 'active' : 'text-gray-700'
                                }`}
                            >
                                <i className="fas fa-sync-alt fa-lg mr-3"></i>
                                顔データ再登録
                            </Link>
                        </li>

                        <li className="menu-header"><span>VERIFY</span></li>
                        <li>
                            <Link
                                to="/verify"
                                className={`flex items-center p-3 menu-item rounded relative ${
                                    activeItem === '/verify' ? 'active' : 'text-gray-700'
                                }`}
                            >
                                <i className="fas fa-user-check fa-lg mr-3"></i>
                                顔認証
                            </Link>
                        </li>
                        <li>
                            <Link
                                to="/liveness"
                                className={`flex items-center p-3 menu-item rounded relative ${
                                    activeItem === '/liveness' ? 'active' : 'text-gray-700'
                                }`}
                            >
                                <i className="fas fa-eye fa-lg mr-3"></i>
                                ライブネスチェック
                            </Link>
                        </li>

                        {/* ★ 这里插入“マニュアル”菜单项 */}
                        <li className="menu-header"><span>MANUAL</span></li>
                        <li>
                            <Link
                                to="/manual"
                                className={`flex items-center p-3 menu-item rounded relative ${
                                    activeItem === '/manual' ? 'active' : 'text-gray-700'
                                }`}
                            >
                                <i className="fas fa-book fa-lg mr-3"></i>
                                マニュアル
                            </Link>
                        </li>

                        <li className="menu-header"><span>ATTENDANCE</span></li>
                        <li>
                            <Link
                                to="/attendance"
                                className={`flex items-center p-3 menu-item rounded relative ${
                                    activeItem === '/attendance' ? 'active' : 'text-gray-700'
                                }`}
                            >
                                <i className="fas fa-users fa-lg mr-3"></i>
                                出退勤
                            </Link>
                        </li>
                    </ul>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
