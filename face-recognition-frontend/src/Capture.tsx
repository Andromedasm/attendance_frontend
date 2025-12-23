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

import './styles.scss';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const HEADER_H = 84;

const Capture: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [employeeNumber, setEmployeeNumber] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [videoStarted, setVideoStarted] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmCallback, setConfirmCallback] = useState<() => void>(() => {});

  const [isRegistering, setIsRegistering] = useState(false);

  const showToastError = (msg: string) => toast.error(msg, { autoClose: 5000 });
  const showToastSuccess = (html: string) =>
    toast.success(<div dangerouslySetInnerHTML={{ __html: html }} />, { autoClose: 5000 });
  const showToastInfo = (html: string) =>
    toast.info(<div dangerouslySetInnerHTML={{ __html: html }} />, { autoClose: 5000 });

  const showConfirm = (msg: string, callback: () => void) => {
    setConfirmMessage(msg);
    setConfirmCallback(() => callback);
    setConfirmOpen(true);
  };

  const handleEmployeeNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const number = e.target.value;
    setEmployeeNumber(number);

    if (number.trim() !== '') {
      fetch(`/api/get_employee_name?employeeNumber=${encodeURIComponent(number.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.employeeName) {
            setEmployeeName(data.employeeName);
            setMessage(`取得した社員名: ${data.employeeName}`);
          } else {
            setEmployeeName('');
            setMessage('該当社員が見つかりません');
          }
        })
        .catch((error) => {
          console.error('Error fetching employee name:', error);
          setMessage('社員名を取得できませんでした');
        });
    } else {
      setEmployeeName('');
      setMessage('');
    }
  };

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
        console.error('Error accessing media devices.', error);
        showToastError('ビデオを開始できません: ' + error.message);
      });
  };

  const stopVideo = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setVideoStarted(false);
  };

  const capture = () => {
    if (!employeeNumber.trim() || !employeeName.trim()) {
      showToastError('社員番号と名前を記入してください.');
      return;
    }

    setIsRegistering(true);
    setStatus('アップロード中...');

    const video = videoRef.current;
    if (!video) {
      showToastError('ビデオが準備できていません');
      resetRegisterButton();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        showToastError('画像を取得できませんでした');
        resetRegisterButton();
        return;
      }

      const formData = new FormData();
      formData.append('image', blob, employeeNumber + '.png');
      formData.append('employeeNumber', employeeNumber);
      formData.append('employeeName', employeeName);

      fetch('/api/upload', { method: 'POST', body: formData })
        .then((response) => {
          if (!response.ok) throw response;
          return response.json();
        })
        .then((data) => {
          setStatus('');
          if (data.similar) {
            const matchesInfo = data.matches
              .map(
                (match: any) =>
                  `社員番号: ${match.employee_number}, 名前: ${match.employee_name}, 類似度: ${match.similarity.toFixed(
                    2
                  )}`
              )
              .join('<br />');

            showConfirm(`類似な顔が存在します:<br />${matchesInfo}<br />アップロードしますか?`, () => {
              formData.append('override', 'true');
              fetch('/api/upload', { method: 'POST', body: formData })
                .then((resp) => resp.json())
                .then((data2) => showToastInfo(data2.message))
                .catch((error) => showToastError('アップロードに失敗しました: ' + error.message));
            });
          } else {
            showToastInfo(data.message);
          }
        })
        .catch((error) => {
          setStatus('');
          if ((error as any).json) {
            (error as Response).json().then((body: any) => showToastError(body.error));
          } else {
            console.error('Error uploading the image.', error);
            showToastError((error as Error).message);
          }
        })
        .finally(() => resetRegisterButton());
    }, 'image/jpeg', 0.9);
  };

  const resetRegisterButton = () => {
    setIsRegistering(false);
    setStatus('');
  };

  const verifyFace = () => {
    const video = videoRef.current;
    if (!video) {
      showToastError('ビデオが準備できていません');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        showToastError('画像を取得できませんでした');
        return;
      }

      const formData = new FormData();
      formData.append('image', blob);

      fetch('/api/verify', { method: 'POST', body: formData })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            showToastError('認証失敗: ' + data.error);
          } else if (data.found_faces?.length > 0) {
            const info = data.found_faces
              .map(
                (f: any) =>
                  `社員番号: ${f.employee_number}, 名前: ${f.employee_name}, 類似度: ${
                    f.similarity?.toFixed(2) ?? 'N/A'
                  }`
              )
              .join('<br/>');
            showToastSuccess(`以下の顔が認証されました:<br/>${info}`);
          } else if (data.message) {
            showToastInfo(data.message);
          } else {
            showToastInfo('認証結果を取得できませんでした');
          }
        })
        .catch((err) => {
          console.error(err);
          showToastError('認証エラー: ' + err.message);
        });
    }, 'image/jpeg', 0.9);
  };

  const canOperate = videoStarted;
  const canRegister = canOperate && !isRegistering;

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />

        <div className="flex-1 overflow-hidden">
          <header
            className="border-b border-black/5 bg-white/80 backdrop-blur"
            style={{ height: HEADER_H }}
          >
            <div className="flex h-full items-center justify-between px-6">
              {/* 给 Sidebar 左上角汉堡按钮留空 */}
              <div className="w-16 shrink-0" aria-hidden="true" />

              <div className="flex items-center gap-3">
                <span
                  className={[
                    'rounded-full px-4 py-2 text-sm font-semibold',
                    videoStarted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {videoStarted ? 'ON' : 'OFF'}
                </span>

                {!videoStarted ? (
                  <button
                    onClick={startVideo}
                    className="h-14 rounded-2xl bg-slate-900 px-7 text-lg font-semibold text-white shadow-sm
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                  >
                    Start
                  </button>
                ) : (
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

          <main
            className="overflow-auto px-6 py-6"
            style={{ height: `calc(100dvh - ${HEADER_H}px)` }}
          >
            <div className="grid grid-cols-[2.35fr_1fr] gap-6">
              {/* 左：视频（未启动时在视频区域内提示并提供大按钮） */}
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

                  {!videoStarted && (
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

                {status && (
                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                    <p className="text-base font-semibold text-slate-700">{status}</p>
                  </div>
                )}
              </section>

              {/* 右：员工号 + 自动姓名（不可修改） + 按钮 */}
              <aside className="flex flex-col gap-6">
                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="space-y-5">
                    <input
                      type="text"
                      value={employeeNumber}
                      onChange={handleEmployeeNumberChange}
                      placeholder="社員番号"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg text-slate-900
                                 placeholder:text-slate-400 shadow-sm outline-none
                                 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                    />

                    {/* 不可修改：readOnly + 更像系统填充 */}
                    <input
                      type="text"
                      value={employeeName}
                      readOnly
                      placeholder="社員名（自動入力）"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 text-lg text-slate-900
                                 placeholder:text-slate-400 shadow-sm outline-none
                                 ring-1 ring-black/5"
                    />

                    {message && (
                      <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200/60">
                        <p className="text-base font-semibold text-emerald-900">{message}</p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={capture}
                      disabled={!canRegister}
                      className={[
                        'h-16 w-full rounded-3xl text-2xl font-extrabold text-white shadow-sm transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                        canRegister ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed',
                      ].join(' ')}
                    >
                      {isRegistering ? '登録中...' : '登録'}
                    </button>

                    <button
                      onClick={verifyFace}
                      disabled={!canOperate}
                      className={[
                        'h-16 w-full rounded-3xl text-2xl font-extrabold text-white shadow-sm transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2',
                        canOperate
                          ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-rose-700'
                          : 'bg-slate-300 cursor-not-allowed',
                      ].join(' ')}
                    >
                      認証
                    </button>
                  </div>
                </section>
              </aside>
            </div>
          </main>

          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle style={{ fontSize: '1.3rem', fontWeight: 800 }}>確認</DialogTitle>
            <DialogContent>
              <DialogContentText
                dangerouslySetInnerHTML={{ __html: confirmMessage }}
                style={{ fontSize: '1.1rem', lineHeight: 1.8 }}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setConfirmOpen(false)}
                variant="contained"
                style={{ backgroundColor: '#ef4444', color: 'white', fontSize: '1.05rem' }}
              >
                NO
              </Button>
              <Button
                onClick={() => {
                  confirmCallback();
                  setConfirmOpen(false);
                }}
                variant="contained"
                style={{ backgroundColor: '#2563eb', color: 'white', fontSize: '1.05rem' }}
              >
                YES
              </Button>
            </DialogActions>
          </Dialog>

          <ToastContainer />
        </div>
      </div>
    </div>
  );
};

export default Capture;
