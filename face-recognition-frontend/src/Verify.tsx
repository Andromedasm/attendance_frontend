import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const HEADER_H = 84;

const Verify: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoStarted, setVideoStarted] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyText, setVerifyText] = useState('認証');

  const showError = (msg: string) => toast.error(msg, { autoClose: 5000 });
  const showInfo = (msg: string) =>
    toast.info(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });
  const showSuccess = (msg: string) =>
    toast.success(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });

  const startVideo = () => {
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(async (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {}
          setVideoStarted(true);
        }
      })
      .catch((error) => {
        console.error(error);
        showError('ビデオを開始できません: ' + error.message);
      });
  };

  const stopVideo = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setVideoStarted(false);
  };

  const verify = () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) {
      showError('カメラを起動してください');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showError('画像を取得できませんでした');
          return;
        }

        setIsVerifying(true);
        setVerifyText('認証中...');

        const formData = new FormData();
        formData.append('image', blob);

        fetch('/api/verify', { method: 'POST', body: formData })
          .then((response) => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
          })
          .then((data) => {
            if (data.error) {
              showError('認証失敗しました: ' + data.error);
            } else if (data.found_faces && data.found_faces.length > 0) {
              const info = data.found_faces
                .map((f: any) => {
                  const similarity = f.similarity ? f.similarity.toFixed(2) : 'N/A';
                  return `社員番号: ${f.employee_number}, 名前: ${f.employee_name}, 類似度: ${similarity}`;
                })
                .join('<br/>');
              showSuccess(`以下の顔が認証されました:<br/>${info}`);
            } else if (data.message) {
              showInfo(data.message);
            } else {
              showInfo('認証結果を取得できませんでした。');
            }
          })
          .catch((error) => {
            console.error(error);
            showError('認証失敗しました: ' + error.message);
          })
          .finally(() => {
            setIsVerifying(false);
            setVerifyText('認証');
          });
      },
      'image/jpeg',
      0.9
    );
  };

  const canVerify = videoStarted && !isVerifying;

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />

        <div className="flex-1 overflow-hidden">
          {/* ✅ header：移除 Start；OFF 仅显示；ON 改为可点 Stop */}
          <header className="border-b border-black/5 bg-white/80 backdrop-blur" style={{ height: HEADER_H }}>
            <div className="flex h-full items-center justify-between px-6">
              <div className="w-16 shrink-0" aria-hidden="true" />

              <div className="flex items-center gap-3">
                {!videoStarted ? (
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
                    OFF
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={stopVideo}
                    className="h-11 rounded-full bg-slate-900 px-5 text-sm font-extrabold text-white shadow-sm
                               hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                    aria-label="Stop camera"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="overflow-auto px-6 py-6" style={{ height: `calc(100dvh - ${HEADER_H}px)` }}>
            <div className="grid grid-cols-[2.35fr_1fr] gap-6">
              {/* 左：视频（未启动时遮罩内 Start Camera） */}
              <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="relative overflow-hidden rounded-[24px] bg-black ring-1 ring-black/10">
                  <div className="aspect-video w-full">
                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  </div>

                  {!videoStarted && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm p-8">
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-slate-900">
                          下のボタンを押してカメラを起動してください
                        </p>

                        <button
                          onClick={startVideo}
                          className="mt-5 h-16 rounded-3xl bg-slate-900 px-10 text-2xl font-extrabold text-white shadow
                                     focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                        >
                          Start Camera
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 右：認証ボタン */}
              <aside className="flex flex-col gap-6">
                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <button
                    onClick={verify}
                    disabled={!canVerify}
                    className={[
                      'h-16 w-full rounded-3xl text-2xl font-extrabold text-white shadow-sm transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2',
                      canVerify
                        ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-rose-700'
                        : 'bg-slate-300 cursor-not-allowed',
                    ].join(' ')}
                  >
                    {verifyText}
                  </button>

                  <p className="mt-4 text-sm font-semibold text-slate-500">カメラ ON の状態で押してください</p>
                </section>
              </aside>
            </div>
          </main>

          <ToastContainer />
        </div>
      </div>
    </div>
  );
};

export default Verify;
