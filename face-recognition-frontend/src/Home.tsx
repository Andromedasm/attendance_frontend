import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar'; // 引用 Sidebar 组件
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css'; // 确保 Tailwind CSS 被正确引入
import './clock.scss';
import moment from 'moment';

const Home: React.FC = () => {
    const [sidebarVisible, setSidebarVisible] = useState(false);

    const handleStartClick = () => {
        setSidebarVisible(true);
    };

    useEffect(() => {
        const updateTime = () => {
            document.documentElement.style.setProperty('--timer-day', `'${moment().format("dd")}'`);
            document.documentElement.style.setProperty('--timer-hours', `'${moment().format("HH")}'`);
            document.documentElement.style.setProperty('--timer-minutes', `'${moment().format("mm")}'`);
            document.documentElement.style.setProperty('--timer-seconds', `'${moment().format("ss")}'`);
            requestAnimationFrame(updateTime);
        };
        requestAnimationFrame(updateTime);
    }, []);

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200 overflow-hidden">
            {sidebarVisible && (
                <div className={`transition-transform duration-1000 ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'}`}>
                    <Sidebar /> {/* 使用 Sidebar 组件 */}
                </div>
            )}
            <div className={`flex-1 flex flex-col items-center justify-center p-10 w-full min-w-0 transition-all duration-300 ${sidebarVisible ? 'ml-64' : 'ml-0'}`}>
                <h1 className="text-5xl font-bold mb-6">Welcome</h1>
                <div className="clock-container">
                    <div className="clock-col">
                        <p className="clock-day clock-timer"></p>
                        <p className="clock-label">Day</p>
                    </div>
                    <div className="clock-col">
                        <p className="clock-hours clock-timer"></p>
                        <p className="clock-label">Hours</p>
                    </div>
                    <div className="clock-col">
                        <p className="clock-minutes clock-timer"></p>
                        <p className="clock-label">Minutes</p>
                    </div>
                    <div className="clock-col">
                        <p className="clock-seconds clock-timer"></p>
                        <p className="clock-label">Seconds</p>
                    </div>
                </div>
                {!sidebarVisible && (
                    <button
                        onClick={handleStartClick}
                        className="mt-6 text-white bg-gradient-to-br from-purple-600 to-blue-500 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800 font-medium rounded-lg text-xl px-6 py-3 text-center"
                    >
                        Start
                    </button>
                )}
            </div>
        </div>
    );
};

export default Home;
