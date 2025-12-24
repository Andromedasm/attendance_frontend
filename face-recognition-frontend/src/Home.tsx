import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import moment from 'moment';

const Home: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const updateTime = () => {
      document.documentElement.style.setProperty('--timer-day', `'${moment().format('dd')}'`);
      document.documentElement.style.setProperty('--timer-hours', `'${moment().format('HH')}'`);
      document.documentElement.style.setProperty('--timer-minutes', `'${moment().format('mm')}'`);
      document.documentElement.style.setProperty('--timer-seconds', `'${moment().format('ss')}'`);
      requestAnimationFrame(updateTime);
    };
    requestAnimationFrame(updateTime);
  }, []);

  return (
    <div className="flex h-screen font-sans antialiased bg-gray-200 overflow-hidden">
      {/* ✅ 把 clock.scss 合并进 Home.tsx：保持原样式 */}
      <style>{`
        @import url('https://fonts.googleapis.com/css?family=Montserrat:400,700');

        /* clock variable-driven text */
        .clock-day:before { content: var(--timer-day); }
        .clock-hours:before { content: var(--timer-hours); }
        .clock-minutes:before { content: var(--timer-minutes); }
        .clock-seconds:before { content: var(--timer-seconds); }

        /* ⚠️ 注意：原 clock.scss 里有 body 背景/居中。
           你现在的应用布局由页面容器控制，所以这里不再改 body，
           以免影响全站页面。时钟卡片本身样式保持不变。 */

        .clock-container {
          margin-top: 30px;
          margin-bottom: 30px;
          background-color: #080808;
          border-radius: 5px;
          padding: 60px 20px;
          box-shadow: 1px 1px 5px rgba(255,255,255,.15), 0 15px 90px 30px rgba(0,0,0,.25);
          display: flex;
        }

        .clock-col {
          text-align: center;
          margin-right: 40px;
          margin-left: 40px;
          min-width: 90px;
          position: relative;
        }

        .clock-col:not(:last-child):before,
        .clock-col:not(:last-child):after {
          content: "";
          background-color: rgba(255,255,255,.3);
          height: 5px;
          width: 5px;
          border-radius: 50%;
          display: block;
          position: absolute;
          right: -42px;
        }

        .clock-col:not(:last-child):before { top: 35%; }
        .clock-col:not(:last-child):after { top: 50%; }

        .clock-timer:before {
          color: #fff;
          font-size: 4.2rem;
          text-transform: uppercase;
          font-family: 'Montserrat', 'sans-serif';
          font-weight: 700;
        }

        .clock-label {
          color: rgba(255,255,255,.35);
          text-transform: uppercase;
          font-size: .7rem;
          margin-top: 10px;
          font-family: 'Montserrat', 'sans-serif';
          font-weight: 700;
        }

        @media (max-width: 825px) {
          .clock-container {
            flex-direction: column;
            padding-top: 40px;
            padding-bottom: 40px;
          }
          .clock-col + .clock-col { margin-top: 20px; }
          .clock-col:before,
          .clock-col:after { display: none !important; }
        }
      `}</style>

      <Sidebar />

      <div className="flex-1 flex flex-col items-center justify-center p-10 w-full min-w-0">
        {/* 时钟容器：结构不变 */}
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

        {/* 大按钮：保留你原来的 Tailwind 渐变与动画 */}
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
