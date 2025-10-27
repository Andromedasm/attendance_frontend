import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import './clock.scss';
import moment from 'moment';

const Home: React.FC = () => {
    const navigate = useNavigate();

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
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10 w-full min-w-0">

                {/* 时钟容器 */}
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

                {/* 大按钮：颜色和 focus 样式改成你提供的 gradient */}
                <button
                    type="button"
                    onClick={() => navigate('/attendance')}
                    className="
                      mt-10 px-12 py-6
                      text-3xl font-bold
                      text-white
                      bg-gradient-to-r from-red-200 via-red-300 to-yellow-200
                      hover:bg-gradient-to-bl
                      focus:ring-4 focus:outline-none focus:ring-red-100 dark:focus:ring-red-400
                      rounded-lg shadow-lg
                      animate-bounce
                      hover:scale-105 transition-transform
                    "
                >
                    打刻開始はこちら
                </button>
            </div>
        </div>
    );
};

export default Home;
