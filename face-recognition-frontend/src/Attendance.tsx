import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const HEADER_H = 84;

const Attendance: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ===== Camera guard refs (Safari/iPad) =====
  const lastRestartAtRef = useRef<number>(0);
  const restartCountRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const stuckTicksRef = useRef<number>(0);

  // 1=出勤, 2=退勤
  const [selectedStatus, setSelectedStatus] = useState<number>(0);

  // 主按钮：默认“打刻開始”
  const [buttonText, setButtonText] = useState<string>('打刻開始');
  const [isPunching, setIsPunching] = useState<boolean>(false);

  const [videoStarted, setVideoStarted] = useState(false);

  // 二重打刻
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmCallback, setConfirmCallback] = useState<() => void>(() => {});

  // ✅ 最近一次打刻信息
  const [attendanceDetails, setAttendanceDetails] = useState({
    employee_number: '',
    employee_name: '',
    attendance_time: '',
    status: '',
  });

  const [manualOverride, setManualOverride] = useState<boolean>(false);
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());

  // 自動判断：出勤/退勤
  useEffect(() => {
    const checkStatus = () => {
      if (manualOverride) return;
      const currentHour = new Date().getHours();
      if (currentHour >= 4 && currentHour < 15) setSelectedStatus(1);
      else setSelectedStatus(2);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60_000);
    return () => clearInterval(interval);
  }, [manualOverride]);

  // Idle: 15分=>カメラOFF / 60分=>HOME
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      const diff = Date.now() - lastActivityTime;
      if (videoStarted && diff >= 900_000) stopVideo();
      if (diff >= 3_600_000) navigate('/');
    }, 10_000);
    return () => clearInterval(idleCheckInterval);
  }, [videoStarted, lastActivityTime, navigate]);

  // visibilitychange / pagehide => stop camera
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopVideo();
    };
    const onPageHide = () => stopVideo();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetInactivityTimer = () => setLastActivityTime(Date.now());

  const playSuccessSound = () => {
    const audio = new Audio('/sounds/success-sound.mp3');
    audio.play().catch(() => {});
  };
  const playAlertSound = () => {
    const audio = new Audio('/sounds/alert-sound.mp3');
    audio.play().catch(() => {});
  };

  const showConfirm = (msg: string, callback: () => void) => {
    setConfirmMessage(msg);
    setConfirmCallback(() => callback);
    setConfirmOpen(true);
  };

  const stopVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setVideoStarted(false);
    setIsPunching(false);
    setButtonText('打刻開始');
  };

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function captureFrames(
    video: HTMLVideoElement,
    durationMs = 1200,
    intervalMs = 120,
    targetWidth = 640,
    jpegQuality = 0.8
  ): Promise<Blob[]> {
    const frames: Blob[] = [];
    const vw = video.videoWidth || 640;
    const scale = targetWidth ? targetWidth / vw : 1;
    const cw = Math.round(vw * scale);
    const ch = Math.round((video.videoHeight || 480) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    const start = Date.now();
    while (Date.now() - start < durationMs) {
      ctx.drawImage(video, 0, 0, cw, ch);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          jpegQuality
        );
      });
      frames.push(blob);
      await wait(intervalMs);
    }
    if (frames.length < 3) throw new Error('Not enough frames captured');
    return frames;
  }

  const startVideo = () => {
    resetInactivityTimer();
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setVideoStarted(true);
        restartCountRef.current = 0;
        setButtonText('打刻開始');
      })
      .catch((error) => {
        console.error(error);
        playAlertSound();
        toast.error(`カメラを開始できません: ${error.message}`, { autoClose: 5000 });
      });
  };

  const safeRestartCamera = async (reason: string) => {
    if (!videoStarted) return;

    const now = Date.now();
    if (now - lastRestartAtRef.current < 60_000) return; // 60s 节流
    lastRestartAtRef.current = now;

    restartCountRef.current += 1;
    console.warn(`[camera] restart (${restartCountRef.current}) reason=${reason}`);

    stopVideo();
    await new Promise((r) => setTimeout(r, 300));
    startVideo();

    if (restartCountRef.current >= 3) {
      toast.error('カメラが不安定です。再起動してください。', { autoClose: 4000 });
      navigate('/');
    }
  };

  useEffect(() => {
    if (!videoStarted) return;

    lastVideoTimeRef.current = -1;
    stuckTicksRef.current = 0;

    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.srcObject) return;

      const t = v.currentTime;
      if (t === lastVideoTimeRef.current) {
        stuckTicksRef.current += 1;
      } else {
        stuckTicksRef.current = 0;
        lastVideoTimeRef.current = t;
      }

      if (stuckTicksRef.current >= 3) {
        stuckTicksRef.current = 0;
        safeRestartCamera('currentTime_stuck');
      }
    }, 10_000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoStarted]);

  const startAttendance = async () => {
    try {
      resetInactivityTimer();

      if (!videoStarted || !videoRef.current?.srcObject) {
        playAlertSound();
        toast.error('カメラを起動してください', { autoClose: 4000 });
        return;
      }

      if (selectedStatus === 0) {
        playAlertSound();
        toast.error('打刻種類を選択してください', { autoClose: 4000 });
        return;
      }

      setIsPunching(true);
      setButtonText('打刻中...');

      const video = videoRef.current!;
      const deviceTime = new Date().toISOString();

      const frames = await captureFrames(video, 1200, 120, 640, 0.8);
      const bestFrame = frames[Math.floor(frames.length / 2)];

      const buildFormData = (withOverride = false) => {
        const fd = new FormData();
        fd.append('device_time_str', deviceTime);
        fd.append('status', selectedStatus.toString());
        if (withOverride) fd.append('override', 'true');
        fd.append('image', bestFrame, 'frame.jpg');
        return fd;
      };

      const sendOnce = async (formData: FormData) => {
        const res = await fetch('/api/record_attendance', { method: 'POST', body: formData });
        if (!res.ok) {
          let body: any = null;
          try {
            body = await res.json();
          } catch {
            body = null;
          }
          const msg =
            body?.detail ||
            body?.error ||
            (typeof body === 'string' ? body : null) ||
            `打刻に失敗しました(HTTP ${res.status})`;
          throw new Error(msg);
        }
        return res.json();
      };

      const data = await sendOnce(buildFormData(false));

      if (data.error) {
        playAlertSound();
        toast.error(data.error, { autoClose: 5000 });
        return;
      }

      if (data.override) {
        showConfirm(
          `あなたはすでに${data.status === '1' ? '出勤' : '退勤'}しました<br>前回の打刻時間: ${data.attendance_time}<br>上書きしますか？`,
          async () => {
            try {
              const data2 = await sendOnce(buildFormData(true));
              if (data2.error) {
                playAlertSound();
                toast.error(data2.error, { autoClose: 5000 });
              } else {
                playSuccessSound();
                setAttendanceDetails({
                  employee_number: data2.employee_number || '',
                  employee_name: data2.employee_name || '',
                  attendance_time: data2.attendance_time || '',
                  status: selectedStatus === 1 ? '出勤' : '退勤',
                });
                toast.success(
                  <div
                    dangerouslySetInnerHTML={{
                      __html: `<span style="font-size:2rem; font-weight:bold">
                        打刻記録が成功しました<br>
                        社員番号: ${data2.employee_number}<br>
                        社員名: ${data2.employee_name}<br>
                        打刻時間: ${data2.attendance_time}<br>
                        打刻種類: ${selectedStatus === 1 ? '出勤' : '退勤'}
                      </span>`,
                    }}
                  />,
                  { autoClose: 5000 }
                );
              }
            } catch (e: any) {
              playAlertSound();
              toast.error(`上書きに失敗しました: ${e.message}`, { autoClose: 5000 });
            }
          }
        );
        return;
      }

      playSuccessSound();
      setAttendanceDetails({
        employee_number: data.employee_number || '',
        employee_name: data.employee_name || '',
        attendance_time: data.attendance_time || '',
        status: selectedStatus === 1 ? '出勤' : '退勤',
      });

      toast.success(
        <div
          dangerouslySetInnerHTML={{
            __html: `<span style="font-size:2rem; font-weight:bold">
              打刻記録が成功しました<br>
              社員番号: ${data.employee_number}<br>
              社員名: ${data.employee_name}<br>
              打刻時間: ${data.attendance_time}<br>
              打刻種類: ${selectedStatus === 1 ? '出勤' : '退勤'}
            </span>`,
          }}
        />,
        { autoClose: 5000 }
      );
    } catch (err: any) {
      console.error(err);
      playAlertSound();
      toast.error(`打刻に失敗しました: ${err?.message || String(err)}`, { autoClose: 5000 });
    } finally {
      setIsPunching(false);
      setButtonText('打刻開始');
    }
  };

  const handleStatusClick = (status: number) => {
    resetInactivityTimer();
    setSelectedStatus(status);
    setManualOverride(true);
    setTimeout(() => setManualOverride(false), 300_000);
  };

  const statusBtnBase =
    'h-28 rounded-[36px] text-4xl font-extrabold text-white shadow-sm transition-transform ' +
    'active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2';

  const punchBtnBase =
    'h-28 rounded-full text-5xl font-extrabold text-white shadow-sm transition-transform ' +
    'active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2';

  const punchDisabled = !videoStarted || isPunching;

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />

        <div className="flex-1 overflow-hidden">
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
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="md" fullWidth>
              <DialogTitle style={{ fontSize: '1.3rem', fontWeight: 800 }}>確認</DialogTitle>
              <DialogContent>
                <DialogContentText
                  style={{ fontSize: '1.1rem', lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{ __html: confirmMessage }}
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

            <div className="grid grid-cols-[2.35fr_1fr] gap-6">
              <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="relative overflow-hidden rounded-[24px] bg-black ring-1 ring-black/10">
                  <div className="aspect-video w-full">
                    <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
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

              <aside className="flex flex-col gap-6">
                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="grid grid-cols-1 gap-6">
                    <button
                      className={[
                        statusBtnBase,
                        'bg-gradient-to-r from-cyan-500 to-blue-600',
                        selectedStatus === 1
                          ? 'scale-110 ring-4 ring-yellow-300 ring-offset-2 ring-offset-blue-600 border-4 border-white shadow-xl'
                          : 'shadow-md',
                      ].join(' ')}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusClick(1);
                      }}
                    >
                      {selectedStatus === 1 ? '🚀 出勤' : '出勤'}
                    </button>

                    <button
                      className={[
                        statusBtnBase,
                        'bg-gradient-to-r from-pink-500 to-orange-500',
                        selectedStatus === 2
                          ? 'scale-110 ring-4 ring-pink-300 ring-offset-2 ring-offset-orange-500 border-4 border-white shadow-xl'
                          : 'shadow-md',
                      ].join(' ')}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusClick(2);
                      }}
                    >
                      {selectedStatus === 2 ? '🌙 退勤' : '退勤'}
                    </button>

                    <button
                      onClick={startAttendance}
                      disabled={punchDisabled}
                      className={[
                        punchBtnBase,
                        punchDisabled ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700',
                      ].join(' ')}
                    >
                      {buttonText}
                    </button>
                  </div>
                </section>

                {/* ✅ 最近打刻信息卡片 */}
                {attendanceDetails.employee_number && (
                  <section className="rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5">
                    <p className="text-sm font-semibold text-slate-700">直近の打刻</p>
                    <div className="mt-2 text-sm text-slate-600 space-y-1">
                      <p>社員番号: {attendanceDetails.employee_number}</p>
                      <p>社員名: {attendanceDetails.employee_name}</p>
                      <p>打刻時間: {attendanceDetails.attendance_time}</p>
                      <p>種類: {attendanceDetails.status}</p>
                    </div>
                  </section>
                )}
              </aside>
            </div>

            <ToastContainer />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Attendance;