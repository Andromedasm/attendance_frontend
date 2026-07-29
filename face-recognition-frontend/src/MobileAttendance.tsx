// MobileAttendance.tsx
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

const MobileAttendance: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<number>(0);
  const [buttonText, setButtonText] = useState<string>('Start Camera');
  const [isPunching, setIsPunching] = useState<boolean>(false);
  const [cameraOn, setCameraOn] = useState(false);

  const [manualOverride, setManualOverride] = useState<boolean>(false);
  const [lastManualTime, setLastManualTime] = useState<number>(0);

  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideData, setOverrideData] = useState<{
    attendance_time: string;
    status: string;
    blob?: Blob;
    latVal?: number;
    lonVal?: number;
  } | null>(null);

  // 1) 每分钟自动判断 出勤/退勤
  useEffect(() => {
    const checkStatus = () => {
      const now = Date.now();
      if (manualOverride) {
        if (now - lastManualTime < 15 * 60 * 1000) return;
        setManualOverride(false);
      }
      const currentHour = new Date().getHours();
      if (currentHour >= 4 && currentHour < 15) setSelectedStatus(1);
      else setSelectedStatus(2);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60_000);
    return () => clearInterval(interval);
  }, [manualOverride, lastManualTime]);

  // 2) Idle 超时: 10分钟 => 关摄像头; 1小时 => 返回首页
  useEffect(() => {
    const idleCheck = setInterval(() => {
      const diff = Date.now() - lastActivityTime;
      if (diff > 10 * 60 * 1000 && videoRef.current?.srcObject) stopCamera();
      if (diff > 60 * 60 * 1000) navigate('/');
    }, 10_000);

    return () => clearInterval(idleCheck);
  }, [lastActivityTime, navigate]);

  const resetInactivityTimer = () => setLastActivityTime(Date.now());

  const startCamera = async () => {
    resetInactivityTimer();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setButtonText('打刻開始');
    } catch (err: any) {
      console.error('startCamera error:', err);
      toast.error(`カメラ起動失敗: ${err.message}`);
      setCameraOn(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
    setButtonText('Start Camera');
  };

  const handlePunch = () => {
    resetInactivityTimer();

    if (!videoRef.current || !videoRef.current.srcObject) {
      toast.warning('カメラが起動されていません。「Start Camera」ボタンを押してください。');
      return;
    }
    if (selectedStatus === 0) {
      toast.warning('出勤・退勤のいずれかを選択してください。');
      return;
    }

    setIsPunching(true);
    setButtonText('打刻中...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latVal = pos.coords.latitude;
        const lonVal = pos.coords.longitude;

        const video = videoRef.current;
        if (!video) {
          toast.error('ビデオ要素が見つかりません');
          resetPunchButton();
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              toast.error('画像キャプチャ失敗');
              resetPunchButton();
              return;
            }

            const formData = new FormData();
            // 关键：给文件一个名字，后端 image.filename 才稳定
            formData.append('image', blob, `mobile_${Date.now()}.jpg`);
            formData.append('status', selectedStatus.toString());
            formData.append('device_time', new Date().toISOString());
            formData.append('lat', latVal.toString());
            formData.append('lon', lonVal.toString());

            fetch('/facerecapi/mobile_attendance', { method: 'POST', body: formData })
              .then((res) => res.json())
              .then((data) => {
                if (data.override) {
                  setOverrideData({
                    attendance_time: data.attendance_time,
                    status: data.status,
                    blob,
                    latVal,
                    lonVal,
                  });
                  setOverrideDialogOpen(true);
                } else if (data.error || data.detail) {
                  toast.error(data.error || data.detail);
                  resetPunchButton();
                } else {
                  toast.success(`打刻成功：${data.employee_name} - ${data.attendance_time}`);
                  resetPunchButton();
                }
              })
              .catch((err) => {
                toast.error(`打刻失敗: ${err.message}`);
                resetPunchButton();
              });
          },
          'image/jpeg',
          0.9
        );
      },
      (err) => {
        toast.error(`地理位置取得失敗: ${err.message}`);
        resetPunchButton();
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  };

  const handleOverrideConfirm = () => {
    if (!overrideData) return;
    const { blob, latVal, lonVal, status } = overrideData;

    const overrideFormData = new FormData();
    // 关键：同样带文件名
    overrideFormData.append('image', blob!, `mobile_${Date.now()}.jpg`);
    overrideFormData.append('status', status);
    overrideFormData.append('device_time', new Date().toISOString());
    overrideFormData.append('override', 'true');
    overrideFormData.append('lat', latVal!.toString());
    overrideFormData.append('lon', lonVal!.toString());

    fetch('/facerecapi/mobile_attendance', { method: 'POST', body: overrideFormData })
      .then((res2) => res2.json())
      .then((data2) => {
        if (data2.error || data2.detail) toast.error(data2.error || data2.detail);
        else toast.success(`打刻成功：${data2.employee_name} - ${data2.attendance_time}`);
      })
      .catch((err2) => toast.error(`打刻失敗: ${err2.message}`))
      .finally(() => {
        resetPunchButton();
        setOverrideDialogOpen(false);
        setOverrideData(null);
      });
  };

  const handleOverrideCancel = () => {
    toast.info('上書きキャンセルしました。');
    resetPunchButton();
    setOverrideDialogOpen(false);
    setOverrideData(null);
  };

  const resetPunchButton = () => {
    setIsPunching(false);
    if (videoRef.current?.srcObject) setButtonText('打刻開始');
    else setButtonText('Start Camera');
  };

  const handleSelectStatus = (status: number) => {
    resetInactivityTimer();
    setSelectedStatus(status);
    setManualOverride(true);
    setLastManualTime(Date.now());
  };

  const statusLabel = useMemo(() => {
    if (selectedStatus === 1) return '出勤';
    if (selectedStatus === 2) return '退勤';
    return '未選択';
  }, [selectedStatus]);

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* 更矮的 header：只保留 ステータス + Stop */}
      <header className="px-4 pt-3 pb-2">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">ステータス: {statusLabel}</p>

            <button
              type="button"
              onClick={() => {
                resetInactivityTimer();
                if (cameraOn) stopCamera();
              }}
              className={[
                'text-xs font-semibold',
                'rounded-full px-3 py-2',
                cameraOn ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600',
              ].join(' ')}
            >
              {cameraOn ? 'Stop' : 'Idle'}
            </button>
          </div>
        </div>
      </header>

      {/* main：减少底部空白，让 SE 一屏能看到状态按钮 */}
      <main className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+76px)]">
        <div className="mx-auto w-full max-w-sm space-y-3">
          {/* 视频 */}
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-sm ring-1 ring-black/5">
            <div className="aspect-[3/4] w-full">
              <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
            </div>

            {!cameraOn && (
              <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-sm p-5">
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-900">カメラがオフです</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    「Start Camera」を押してください
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                    位置情報とカメラを許可してください
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 出勤/退勤：尽量紧凑但仍好按 */}
          <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectStatus(1)}
                className={[
                  'h-11 rounded-xl text-sm font-extrabold transition',
                  selectedStatus === 1
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-800 active:bg-slate-200',
                ].join(' ')}
              >
                出勤
              </button>
              <button
                type="button"
                onClick={() => handleSelectStatus(2)}
                className={[
                  'h-11 rounded-xl text-sm font-extrabold transition',
                  selectedStatus === 2
                    ? 'bg-pink-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-800 active:bg-slate-200',
                ].join(' ')}
              >
                退勤
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 底部：只保留主按钮，不再放提示文字 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto w-full max-w-sm px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3">
          <button
            onClick={buttonText === 'Start Camera' ? startCamera : handlePunch}
            disabled={isPunching}
            className={[
              'w-full h-12 rounded-2xl font-semibold text-sm text-white transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              isPunching ? 'opacity-70' : 'active:scale-[0.99]',
              buttonText === 'Start Camera'
                ? 'bg-slate-900'
                : 'bg-gradient-to-r from-blue-600 to-violet-600',
            ].join(' ')}
          >
            {buttonText}
          </button>
        </div>
      </div>

      {/* 二重打刻 Dialog */}
      <Dialog open={overrideDialogOpen} onClose={handleOverrideCancel}>
        <DialogTitle style={{ fontSize: '1.1rem', fontWeight: 700 }}>二重打刻の確認</DialogTitle>
        <DialogContent>
          {overrideData && (
            <p style={{ fontSize: '0.95rem', margin: 0, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              既に{overrideData.status === '1' ? '出勤' : '退勤'}打刻があります。{'\n'}
              前回打刻時間: {overrideData.attendance_time}
              {'\n'}
              上書きしますか？
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleOverrideCancel}
            variant="contained"
            style={{ backgroundColor: '#ef4444', color: 'white' }}
          >
            NO
          </Button>
          <Button
            onClick={handleOverrideConfirm}
            variant="contained"
            style={{ backgroundColor: '#2563eb', color: 'white' }}
          >
            YES
          </Button>
        </DialogActions>
      </Dialog>

      <ToastContainer />
    </div>
  );
};

export default MobileAttendance;
