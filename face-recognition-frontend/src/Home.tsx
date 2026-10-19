import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import FaceRecognitionIcon from './FaceRecognitionIcon';
import ThemeBackdrop from './ThemeBackdrop';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './theme-context';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './clock.scss';

const twoDigits = (value: number) => value.toString().padStart(2, '0');

const Home: React.FC = () => {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const hour = now.getHours();
    const greeting = hour < 12 ? 'おはようございます' : hour < 18 ? 'お疲れさまです' : 'こんばんは';
    const dateLabel = new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    }).format(now);

    const clockUnits = [
        {
            label: '曜日',
            value: new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(now),
        },
        { label: '時', value: twoDigits(hour) },
        { label: '分', value: twoDigits(now.getMinutes()) },
        { label: '秒', value: twoDigits(now.getSeconds()) },
    ];

    return (
        <div className="theme-surface home-surface min-h-[100svh] overflow-hidden font-sans" data-theme={theme}>
            <Sidebar />
            <ThemeToggle />
            <ThemeBackdrop />

            <main className="relative z-10 flex min-h-[100svh] items-center justify-center overflow-y-auto px-4 py-20 sm:px-8 sm:py-24">
                <section className="liquid-panel w-full max-w-5xl rounded-[2rem] px-5 py-6 sm:rounded-[2.5rem] sm:px-10 sm:py-10 lg:px-14 lg:py-12">
                    <div className="relative z-10">
                        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="home-eyebrow mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.24em] sm:text-sm">
                                    <span className="inline-block size-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
                                    FACE ATTENDANCE
                                </p>
                                <h1 className="home-title text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                                    {greeting}
                                </h1>
                                <p className="home-date mt-3 text-sm sm:text-base">{dateLabel}</p>
                            </div>

                            <div className="home-status-pill inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-[0.12em] shadow-lg backdrop-blur-xl">
                                <span className="relative flex size-2.5">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-60 motion-reduce:animate-none" />
                                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-300" />
                                </span>
                                SYSTEM ONLINE
                            </div>
                        </header>

                        <time dateTime={now.toISOString()} className="sr-only">
                            {dateLabel} {twoDigits(hour)}:{twoDigits(now.getMinutes())}:{twoDigits(now.getSeconds())}
                        </time>

                        <div className="mt-9 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-4 sm:gap-4" aria-label="現在時刻">
                            {clockUnits.map((unit) => (
                                <div key={unit.label} className="clock-tile rounded-2xl px-3 py-5 text-center sm:rounded-3xl sm:px-5 sm:py-7">
                                    <span className="clock-value block text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                                        {unit.value}
                                    </span>
                                    <span className="clock-label mt-2 block text-[0.65rem] font-bold tracking-[0.28em] sm:text-xs">
                                        {unit.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate('/attendance')}
                            className="liquid-action group mt-8 flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-white transition duration-300 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200 sm:mt-10 sm:rounded-3xl sm:px-8 sm:py-6"
                        >
                            <span className="flex min-w-0 items-center gap-4">
                                <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/25 bg-white/15 shadow-inner sm:size-14">
                                    <FaceRecognitionIcon className="size-7 sm:size-8" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-xl font-bold sm:text-2xl">打刻を開始</span>
                                    <span className="mt-0.5 block truncate text-xs text-cyan-50/70 sm:text-sm">
                                        顔認証で出勤・退勤を記録します
                                    </span>
                                </span>
                            </span>
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-1">
                                <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                            </span>
                        </button>

                        <footer className="home-hint mt-5 flex items-center justify-center gap-2 text-center text-xs sm:mt-7">
                            <i className="fa-solid fa-camera" aria-hidden="true" />
                            カメラを使用できる状態で開始してください
                        </footer>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Home;
