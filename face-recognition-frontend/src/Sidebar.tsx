import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';

type Item = {
  to: string;
  label: string;
  icon: string; // fontawesome class without "fas " prefix
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

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((v) => !v);

  // 路由切换时自动关闭（避免页面跳转后抽屉还开着）
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ESC 关闭
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
      {/* 左上角汉堡按钮（始终显示） */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        className={[
          'fixed left-4 top-4 z-50',
          'h-12 w-12 rounded-2xl',
          'bg-white/80 backdrop-blur shadow-sm ring-1 ring-black/10',
          'grid place-items-center',
          'active:scale-[0.98] transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2',
        ].join(' ')}
      >
        <i className="fas fa-bars text-lg text-slate-900" />
      </button>

      {/* 遮罩 */}
      <div
        onClick={close}
        className={[
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden="true"
      />

      {/* 抽屉 */}
      <aside
        role="dialog"
        aria-modal="true"
        className={[
          'fixed left-0 top-0 z-50 h-dvh w-[320px] max-w-[85vw]',
          'bg-white shadow-2xl ring-1 ring-black/10',
          'transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          {/* 顶部品牌区（文字减少但仍可识别） */}
          <div className="px-5 pt-5 pb-4 border-b border-black/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-widest text-slate-500">FACE</p>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                  顔認証システム
                </h1>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="h-10 w-10 rounded-xl bg-slate-100 text-slate-900 ring-1 ring-black/5 hover:bg-slate-200
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          {/* 菜单 */}
          <nav className="flex-1 overflow-auto px-3 py-4">
            <div className="space-y-5">
              {sections.map((sec) => (
                <div key={sec.title}>
                  <p className="px-3 text-[11px] font-extrabold tracking-widest text-slate-400">
                    {sec.title}
                  </p>

                  <ul className="mt-2 space-y-1">
                    {sec.items.map((it) => {
                      const active = location.pathname === it.to;
                      return (
                        <li key={it.to}>
                          <Link
                            to={it.to}
                            onClick={close}
                            className={[
                              'group relative flex items-center gap-3 rounded-2xl px-3 py-3',
                              'text-base font-semibold',
                              'transition',
                              active
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-800 hover:bg-slate-100',
                            ].join(' ')}
                          >
                            {/* 左侧强调条 */}
                            <span
                              className={[
                                'absolute left-1 top-1/2 -translate-y-1/2 h-7 w-1 rounded-full transition',
                                active ? 'bg-white/90' : 'bg-transparent group-hover:bg-slate-300',
                              ].join(' ')}
                              aria-hidden="true"
                            />

                            <span
                              className={[
                                'grid h-10 w-10 place-items-center rounded-2xl ring-1 ring-black/5',
                                active ? 'bg-white/10 text-white' : 'bg-white text-slate-900',
                              ].join(' ')}
                              aria-hidden="true"
                            >
                              <i className={`fas ${it.icon}`} />
                            </span>

                            <span className="truncate">{it.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          {/* 底部（可选信息，尽量少字） */}
          <div className="border-t border-black/5 px-5 py-4">
            <p className="text-xs font-medium text-slate-500">v1.0</p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
