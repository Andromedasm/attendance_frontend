import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

const Sidebar: React.FC = () => {
    return (
        <div className="sidebar">
            <div className="px-5 py-6">
                <h1 className="text-xl font-bold text-center mb-4">顔認証システム</h1>
                <ul className="space-y-1">
                    <li className="menu-header"><span>REGISTER</span></li>
                    <li>
                        <a href="/capture" className="flex items-center p-3 text-gray-700 menu-item rounded">
                            <i className="fas fa-camera fa-lg mr-3"></i>
                            顔登録
                        </a>
                    </li>
                    <li>
                        <a href="/re_register" className="flex items-center p-3 text-gray-700 menu-item rounded">
                            <i className="fas fa-sync-alt fa-lg mr-3"></i>
                            顔データ再登録
                        </a>
                    </li>
                    <li className="menu-header"><span>VERIFY</span></li>
                    <li>
                        <a href="/verify" className="flex items-center p-3 text-gray-700 menu-item rounded">
                            <i className="fas fa-user-check fa-lg mr-3"></i>
                            顔認証
                        </a>
                    </li>
                    <li>
                        <a href="/liveness" className="flex items-center p-3 text-gray-700 menu-item rounded">
                            <i className="fas fa-eye fa-lg mr-3"></i>
                            ライブネスチェック
                        </a>
                    </li>
                    <li className="menu-header"><span>ATTENDANCE</span></li>
                    <li>
                        <a href="/attendance" className="flex items-center p-3 text-gray-700 menu-item rounded">
                            <i className="fas fa-users fa-lg mr-3"></i>
                            出退勤
                        </a>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default Sidebar;
