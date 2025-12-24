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
    <div className="flex h-screen font-sans antialiased overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css?family=Montserrat:400,700');

        /* ===== iOS-like background (scoped to Home) ===== */
        .home-ios-bg {
          position: relative;
          background:
            radial-gradient(1200px 700px at 20% 10%, rgba(56,189,248,.35), transparent 60%),
            radial-gradient(900px 600px at 80% 20%, rgba(232,121,249,.28), transparent 55%),
            radial-gradient(900px 700px at 60% 90%, rgba(251,191,36,.20), transparent 55%),
            linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%);
        }

        /* ===== keep your timer mechanism ===== */
        .clock-day:before { content: var(--timer-day); }
        .clock-hours:before { content: var(--timer-hours); }
        .clock-minutes:before { content: var(--timer-minutes); }
        .clock-seconds:before { content: var(--timer-seconds); }

        /* ===== glass clock container ===== */
        .clock-container {
          margin-top: 30px;
          margin-bottom: 30px;

          /* glass */
          background: rgba(15, 23, 42, 0.35); /* slate-900/35 */
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 24px;
          padding: 56px 22px;

          /* iOS blur */
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);

          /* soft shadow */
          box-shadow:
            0 30px 80px rgba(0,0,0,.22),
            inset 0 1px 0 rgba(255,255,255,.18);

          display: flex;
        }

        .clock-col {
          text-align: center;
          margin-right: 40px;
          margin-left: 40px;
          min-width: 92px;
          position: relative;
        }

        /* dotted separators */
        .clock-col:not(:last-child):before,
        .clock-col:not(:last-child):after {
          content: "";
          background-color: rgba(255,255,255,.45);
          height: 6px;
          width: 6px;
          border-radius: 999px;
          display: block;
          position: absolute;
          right: -42px;
          box-shadow: 0 0 0 6px rgba(255,255,255,0.06);
        }
        .clock-col:not(:last-child):before { top: 36%; }
        .clock-col:not(:last-child):after { top: 52%; }

        .clock-timer:before {
          color: rgba(255,255,255,.96);
          font-size: 4.15rem;
          text-transform: uppercase;
          font-family: 'Montserrat', 'sans-serif';
          font-weight: 700;
          letter-spacing: -0.03em;
          text-shadow: 0 8px 24px rgba(0,0,0,.25);
        }

        .clock-label {
          color: rgba(255,255,255,.55);
          text-transform: uppercase;
          font-size: .72rem;
          margin-top: 12px;
          font-family: 'Montserrat', 'sans-serif';
          font-weight: 700;
          letter-spacing: .18em;
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

      <div className="home-ios-bg flex-1 flex flex-col items-center justify-center p-10 w-full min-w-0">
        {/* clock (structure unchanged) */}
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

        {/* CTA: also glassy / iOS-like */}
        <button
          type="button"
          onClick={() => navigate('/attendance')}
          className="
    mt-10 px-12 py-6
    text-3xl font-extrabold text-white
    rounded-2xl
    animate-bounce
    transition
    hover:scale-105 active:scale-[0.99]

    bg-gradient-to-r from-sky-300/60 via-fuchsia-300/45 to-amber-200/55
    backdrop-blur-xl
    ring-1 ring-white/40
    shadow-[0_20px_60px_rgba(0,0,0,0.18)]
    hover:bg-gradient-to-r hover:from-white/38 hover:via-white/26 hover:to-white/38

    focus:outline-none focus:ring-4 focus:ring-white/50
  "
        >
          打刻開始はこちら
        </button>
      </div>
    </div>
  );
};

export default Home;
