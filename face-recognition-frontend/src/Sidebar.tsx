import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';

type Item = {
  to: string;
  label: string;
  icon: string;
};

type Section = {
  title: string;
  items: Item[];
};

const Sidebar: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const sections: Section[] = useMemo(
    () => [
      {
        title: 'REGISTER',
        items: [
          { to: '/capture', label: '顔登録', icon: 'fa-camera' },
          { to: '/re_register', label: '顔データ再登録', icon: 'fa-sync-alt' },
        ],
      },
      {
        title: 'VERIFY',
        items: [
          { to: '/verify', label: '顔認証', icon: 'fa-user-check' },
          { to: '/liveness', label: 'ライブネスチェック', icon: 'fa-eye' },
        ],
      },
      {
        title: 'MANUAL',
        items: [{ to: '/manual', label: 'マニュアル', icon: 'fa-book' }],
      },
      {
        title: 'ATTENDANCE',
        items: [{ to: '/attendance', label: '出退勤', icon: 'fa-users' }],
      },
    ],
    []
  );

  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((v) => !v);

  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Fancy glass hamburger */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        className={[
          'fixed left-4 top-4 z-50',
          'h-12 w-12 rounded-2xl',
          'bg-white/25 backdrop-blur-xl',
          'ring-1 ring-white/25 shadow-[0_10px_30px_rgba(0,0,0,0.18)]',
          'grid place-items-center',
          'transition active:scale-[0.98]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900/10',
        ].join(' ')}
      >
        <i className="fas fa-bars text-lg text-slate-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]" />
      </button>

      {/* Backdrop: blur + subtle gradient */}
      <div
        onClick={close}
        className={[
          'fixed inset-0 z-40 transition-opacity',
          'bg-gradient-to-br from-black/45 via-black/30 to-black/45',
          'backdrop-blur-md',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden="true"
      />

      {/* Drawer: glass panel + gradient border */}
      <aside
        role="dialog"
        aria-modal="true"
        className={[
          'fixed left-0 top-0 z-50 h-dvh w-[340px] max-w-[86vw]',
          'transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Gradient border frame */}
        <div className="h-full p-[1px] bg-gradient-to-b from-white/35 via-white/10 to-white/25">
          <div
            className={[
              'flex h-full flex-col overflow-hidden',
              'bg-white/30 backdrop-blur-2xl',
              'ring-1 ring-white/20',
              'shadow-[0_25px_70px_rgba(0,0,0,0.35)]',
            ].join(' ')}
          >
            {/* Top brand (glow) */}
            <div className="relative border-b border-white/15 px-5 pt-5 pb-4">
              {/* soft glow */}
              <div className="pointer-events-none absolute -top-24 left-0 h-48 w-48 rounded-full bg-fuchsia-400/25 blur-3xl" />
              <div className="pointer-events-none absolute -top-20 right-0 h-48 w-48 rounded-full bg-sky-400/25 blur-3xl" />

              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-extrabold tracking-[0.25em] text-slate-800/70">
                    FACE
                  </p>
                  <h1 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
                    顔認証システム
                  </h1>
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className={[
                    'h-10 w-10 rounded-2xl',
                    'bg-white/30 hover:bg-white/40',
                    'ring-1 ring-white/25',
                    'text-slate-900',
                    'transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900/10',
                  ].join(' ')}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {/* Menu */}
            <nav className="flex-1 overflow-auto px-3 py-4">
              <div className="space-y-6">
                {sections.map((sec) => (
                  <div key={sec.title}>
                    <p className="px-3 text-[11px] font-extrabold tracking-[0.22em] text-slate-800/55">
                      {sec.title}
                    </p>

                    <ul className="mt-2 space-y-2">
                      {sec.items.map((it) => {
                        const active = location.pathname === it.to;
                        return (
                          <li key={it.to}>
                            <Link
                              to={it.to}
                              onClick={close}
                              className={[
                                'group relative flex items-center gap-3 rounded-2xl px-3 py-3',
                                'text-[17px] font-extrabold',
                                'transition',
                                active
                                  ? 'text-white'
                                  : 'text-slate-900/90 hover:text-slate-900',
                                active
                                  ? 'bg-gradient-to-r from-slate-900/85 via-slate-900/75 to-slate-900/60'
                                  : 'bg-white/10 hover:bg-white/20',
                                'ring-1',
                                active ? 'ring-white/25' : 'ring-white/15',
                                'shadow-sm',
                              ].join(' ')}
                            >
                              {/* left accent */}
                              <span
                                className={[
                                  'absolute left-1 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full',
                                  active
                                    ? 'bg-gradient-to-b from-sky-300 via-fuchsia-300 to-amber-200'
                                    : 'bg-white/0 group-hover:bg-white/25',
                                ].join(' ')}
                                aria-hidden="true"
                              />

                              <span
                                className={[
                                  'grid h-11 w-11 place-items-center rounded-2xl',
                                  'ring-1 ring-white/20',
                                  active
                                    ? 'bg-white/10 text-white'
                                    : 'bg-white/25 text-slate-900',
                                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
                                ].join(' ')}
                                aria-hidden="true"
                              >
                                <i className={`fas ${it.icon}`} />
                              </span>

                              <span className="truncate drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]">
                                {it.label}
                              </span>

                              {/* subtle right chevron */}
                              <span
                                className={[
                                  'ml-auto text-xs transition-opacity',
                                  active ? 'opacity-80' : 'opacity-0 group-hover:opacity-60',
                                ].join(' ')}
                                aria-hidden="true"
                              >
                                <i className="fas fa-chevron-right" />
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>

            {/* Bottom (tiny) */}
            <div className="border-t border-white/15 px-5 py-4">
              <p className="text-xs font-semibold text-slate-900/60">v1.0</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
