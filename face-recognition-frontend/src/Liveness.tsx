import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import '@fortawesome/fontawesome-free/css/all.min.css';

const HEADER_H = 84;

const Liveness: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isVideoStarted, setIsVideoStarted] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (msg: string) => {
    setAlertMessage(msg);
    setAlertOpen(true);
  };

  const startVideo = () => {
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      .then(async (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {}
        }
        setIsVideoStarted(true);
      })
      .catch((error) => {
        console.error('Error accessing the webcam', error);
        showAlert('カメラを開始できません: ' + error.message);
      });
  };

  const stopVideo = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setIsVideoStarted(false);
  };

  const performLivenessCheck = () => {
    if (!videoRef.current || !canvasRef.current) {
      showAlert('Camera is not ready.');
      return;
    }
    if (!videoRef.current.srcObject) {
      showAlert('カメラを起動してください');
      return;
    }

    setIsChecking(true);

    // 这里保留你原来的提示逻辑
    showAlert('頭を左右上下に動かしてください。撮影します...');

    const frames: Blob[] = [];
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    let captureCount = 0;
    const maxFrames = 10;

    const intervalId = setInterval(() => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) frames.push(blob);
          captureCount++;

          if (captureCount >= maxFrames) {
            clearInterval(intervalId);
            sendFrames(frames);
          }
        },
        'image/jpeg',
        0.85
      );
    }, 500);
  };

  const sendFrames = (frames: Blob[]) => {
    const formData = new FormData();
    frames.forEach((frame, i) => formData.append(`frame${i}`, frame));

    fetch('/api/liveness', { method: 'POST', body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) showAlert('エラー: ' + data.error);
        else if (data.message) showAlert(data.message);
        else showAlert('不明なエラーが発生しました');
      })
      .catch((error) => {
        console.error('Error:', error);
        showAlert('送信エラー: ' + error.message);
      })
      .finally(() => {
        setIsChecking(false);
      });
  };

  const handleMainClick = () => {
    if (!isVideoStarted) startVideo();
    else performLivenessCheck();
  };

  const mainButtonText = !isVideoStarted ? 'Start' : isChecking ? 'Checking...' : 'Check';

  const canCheck = isVideoStarted && !isChecking;

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />

        <div className="flex-1 overflow-hidden">
          {/* 极简 header：左侧留汉堡按钮位 */}
          <header
            className="border-b border-black/5 bg-white/80 backdrop-blur"
            style={{ height: HEADER_H }}
          >
            <div className="flex h-full items-center justify-between px-6">
              <div className="w-16 shrink-0" aria-hidden="true" />

              <div className="flex items-center gap-3">
                <span
                  className={[
                    'rounded-full px-4 py-2 text-sm font-semibold',
                    isVideoStarted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {isVideoStarted ? 'ON' : 'OFF'}
                </span>

                {isVideoStarted && (
                  <button
                    onClick={stopVideo}
                    className="h-14 rounded-2xl bg-slate-200 px-7 text-lg font-semibold text-slate-900
                               hover:bg-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* main 负责滚动（防溢出） */}
          <main
            className="overflow-auto px-6 py-6"
            style={{ height: `calc(100dvh - ${HEADER_H}px)` }}
          >
            <div className="grid grid-cols-[2.35fr_1fr] gap-6">
              {/* 左：大视频（未启动时区域内大按钮） */}
              <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="relative overflow-hidden rounded-[24px] bg-black ring-1 ring-black/10">
                  <div className="aspect-video w-full">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {!isVideoStarted && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm">
                      <button
                        onClick={startVideo}
                        className="h-16 rounded-3xl bg-slate-900 px-10 text-2xl font-extrabold text-white shadow
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                      >
                        Start Camera
                      </button>
                    </div>
                  )}
                </div>

                {/* 这里是你想更少文字的话可以删除 */}
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  顔を中央に。開始後は頭を左右上下に動かしてください。
                </p>
              </section>

              {/* 右：超大按钮 */}
              <aside className="flex flex-col gap-6">
                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <button
                    onClick={handleMainClick}
                    disabled={isChecking}
                    className={[
                      'h-16 w-full rounded-3xl text-2xl font-extrabold text-white shadow-sm transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2',
                      isChecking
                        ? 'bg-slate-300 cursor-not-allowed'
                        : !isVideoStarted
                          ? 'bg-slate-900 hover:bg-slate-950'
                          : 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-rose-700',
                    ].join(' ')}
                  >
                    {mainButtonText}
                  </button>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                    <p className="text-sm font-semibold text-slate-700">
                      {isVideoStarted
                        ? canCheck
                          ? 'Check を押してください'
                          : '処理中...'
                        : 'Start を押してください'}
                    </p>
                  </div>
                </section>
              </aside>
            </div>
          </main>

          {/* Dialog（字体更大一点） */}
          <Dialog open={alertOpen} onClose={() => setAlertOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle style={{ fontSize: '1.3rem', fontWeight: 800 }}>結果</DialogTitle>
            <DialogContent>
              <DialogContentText style={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
                {alertMessage}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setAlertOpen(false)}
                variant="contained"
                style={{ backgroundColor: '#2563eb', color: 'white', fontSize: '1.05rem' }}
              >
                OK
              </Button>
            </DialogActions>
          </Dialog>

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>
    </div>
  );
};

export default Liveness;
