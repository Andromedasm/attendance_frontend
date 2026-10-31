import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mobileManual from '../docs/mobile-attendance-manual.ja.md?raw';
import './MobileManualDialog.css';

type MobileManualDialogProps = {
  open: boolean;
  onClose: () => void;
};

const [introduction, ...chapters] = mobileManual.trim().split(/\n(?=## )/);
const sections = chapters.map((chapter, index) => {
  const firstLineEnd = chapter.indexOf('\n');
  return {
    id: `mobile-manual-section-${index}`,
    title: chapter.slice(3, firstLineEnd).trim(),
    content: chapter.slice(firstLineEnd + 1).trim(),
  };
});
const shortcuts = [
  { label: '打刻の手順', title: '基本の使い方' },
  { label: '二重打刻', title: '「二重打刻の確認」が表示された場合' },
  { label: '困ったとき', title: '困ったときは' },
];

const MobileManualDialog: React.FC<MobileManualDialogProps> = ({ open, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const jumpToSection = (title: string) => {
    const section = sections.find((item) => item.title === title);
    const content = contentRef.current;
    const target = section && content?.querySelector(`#${section.id}`);
    if (content && target) {
      content.scrollTo({
        top: content.scrollTop + target.getBoundingClientRect().top - content.getBoundingClientRect().top - 16,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby="mobile-manual-title"
      aria-describedby="mobile-manual-description"
      className="mobile-manual-dialog"
      slotProps={{
        container: {
          sx: {
            padding: 'max(12px, env(safe-area-inset-top, 0px)) 12px max(12px, env(safe-area-inset-bottom, 0px))',
          },
        },
        paper: {
          sx: {
            m: 0,
            width: '100%',
            maxHeight: '100%',
            borderRadius: '28px',
            overflow: 'hidden',
            backgroundColor: '#f8fafc',
            boxShadow: '0 28px 90px rgba(15, 23, 42, 0.28)',
            fontFamily: 'inherit',
          },
        },
        backdrop: {
          sx: { backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)' },
        },
      }}
    >
      <div className="mobile-manual-dialog__header">
        <div className="mobile-manual-dialog__heading">
          <span className="mobile-manual-dialog__icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5.5C9 3.8 5.6 3.6 3 4.5v14c2.6-.9 6-.7 9 1 3-1.7 6.4-1.9 9-1v-14c-2.6-.9-6-.7-9 1Z" />
              <path d="M12 5.5v14M6.5 8.5c.9 0 1.7.2 2.5.5m-2.5 3c.9 0 1.7.2 2.5.5m6-3c.8-.3 1.6-.5 2.5-.5M15 13c.8-.3 1.6-.5 2.5-.5" />
            </svg>
          </span>
          <div className="mobile-manual-dialog__titles">
            <p className="mobile-manual-dialog__eyebrow">モバイル版顔認証</p>
            <DialogTitle id="mobile-manual-title" sx={{ p: 0, fontFamily: 'inherit', fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.4 }}>
              使い方ガイド
            </DialogTitle>
          </div>
          <button type="button" autoFocus onClick={onClose} className="mobile-manual-dialog__close" aria-label="マニュアルを閉じる">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p id="mobile-manual-description" className="mobile-manual-dialog__description">
          出勤・退勤の手順と、困ったときの対処方法
        </p>
        <nav className="mobile-manual-dialog__shortcuts" aria-label="マニュアルの目次">
          {shortcuts.map((shortcut) => (
            <button key={shortcut.title} type="button" onClick={() => jumpToSection(shortcut.title)}>
              {shortcut.label}
              <span aria-hidden="true">↓</span>
            </button>
          ))}
        </nav>
      </div>

      <DialogContent ref={contentRef} className="mobile-manual-dialog__content" sx={{ p: 0 }}>
        <details className="mobile-manual-dialog__intro">
          <summary>
            このアプリについて
            <span aria-hidden="true">＋</span>
          </summary>
          <div className="mobile-manual-dialog__markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {introduction.replace(/^# .*\n+/, '')}
            </ReactMarkdown>
          </div>
        </details>
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className={`mobile-manual-dialog__section${section.title === '困ったときは' ? ' mobile-manual-dialog__section--help' : ''}`}
          >
            <div className="mobile-manual-dialog__section-heading">
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h3 id={`${section.id}-title`}>{section.title}</h3>
            </div>
            <div className="mobile-manual-dialog__markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
            </div>
          </section>
        ))}
      </DialogContent>

      <div className="mobile-manual-dialog__footer">
        <button type="button" onClick={onClose} className="mobile-manual-dialog__return">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m10 6-6 6 6 6M4 12h16" />
          </svg>
          打刻画面に戻る
        </button>
      </div>
    </Dialog>
  );
};

export default MobileManualDialog;
