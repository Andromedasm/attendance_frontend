// MobileAttendance.tsx
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// MUI
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

const MobileAttendance: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 出勤(1) or 退勤(2)
  const [selectedStatus, setSelectedStatus] = useState<number>(0);

  // 按钮文字：初始 "Start Camera"，点击后变成 "打刻開始"
  const [buttonText, setButtonText] = useState<string>('Start Camera');

  // 是否处于打刻中
  const [isPunching, setIsPunching] = useState<boolean>(false);

  // 摄像头是否开启（用 state，避免仅靠 ref 导致 UI 不更新）
  const [cameraOn, setCameraOn] = useState(false);

  // 手动选择出勤/退勤 => 15分钟不自动判断
  const [manualOverride, setManualOverride] = useState<boolean>(false);
  const [lastManualTime, setLastManualTime] = useState<number>(0);

  // Idle检测
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());

  // MUI 对话框控制
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideData, setOverrideData] = useState<{
    attendance_time: string;
    status: string;
    blob?: Blob;
    latVal?: number;
    lonVal?: number;
  } | null>(null);

  // -------------------------------------------
  // 1) 每分钟自动判断 出勤/退勤
  // -------------------------------------------
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

  // -------------------------------------------
  // 2) Idle 超时: 10分钟 => 关摄像头; 1小时 => 返回首页
  // -------------------------------------------
  useEffect(() => {
    const idleCheck = setInterval(() => {
      const diff = Date.now() - lastActivityTime;
      if (diff > 10 * 60 * 1000 && videoRef.current?.srcObject) {
        stopCamera();
      }
      if (diff > 60 * 60 * 1000) {
        navigate('/');
      }
    }, 10_000);

    return () => clearInterval(idleCheck);
  }, [lastActivityTime, navigate]);

  const resetInactivityTimer = () => setLastActivityTime(Date.now());

  // -------------------------------------------
  // 打开摄像头
  // -------------------------------------------
  const startCamera = async () => {
    resetInactivityTimer();
    try {
      // iPhone 前置更适合打卡；如果你想用后置改为 environment
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

  // -------------------------------------------
  // 关闭摄像头
  // -------------------------------------------
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
    setButtonText('Start Camera');
  };

  // -------------------------------------------
  // 点击打卡：先获取地理位置 => 截图 => fetch
  // -------------------------------------------
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

        canvas.toBlob((blob) => {
          if (!blob) {
            toast.error('画像キャプチャ失敗');
            resetPunchButton();
            return;
          }

          const formData = new FormData();
          formData.append('image', blob);
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
        }, 'image/jpeg', 0.9);
      },
      (err) => {
        toast.error(`地理位置取得失敗: ${err.message}`);
        resetPunchButton();
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000,
      }
    );
  };

  // -------------------------------------------
  // 二重打刻 => YES
  // -------------------------------------------
  const handleOverrideConfirm = () => {
    if (!overrideData) return;
    const { blob, latVal, lonVal, status } = overrideData;

    const overrideFormData = new FormData();
    overrideFormData.append('image', blob!);
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

  // NO
  const handleOverrideCancel = () => {
    toast.info('上書きキャンセルしました。');
    resetPunchButton();
    setOverrideDialogOpen(false);
    setOverrideData(null);
  };

  // 重置按钮
  const resetPunchButton = () => {
    setIsPunching(false);
    if (videoRef.current?.srcObject) setButtonText('打刻開始');
    else setButtonText('Start Camera');
  };

  // 用户手动选择 出勤 / 退勤
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
      {/* 顶部 */}
      <header className="px-4 pt-4 pb-3">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">打刻</h1>
              <p className="text-xs text-slate-500">ステータス: {statusLabel}</p>
            </div>

            {/* 可选：给个关摄像头的小按钮 */}
            <button
              type="button"
              onClick={() => {
                resetInactivityTimer();
                if (cameraOn) stopCamera();
              }}
              className={[
                'text-xs font-medium',
                'rounded-full px-3 py-1.5',
                cameraOn ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600',
              ].join(' ')}
            >
              {cameraOn ? 'Stop' : 'Idle'}
            </button>
          </div>
        </div>
      </header>

      {/* 中间内容 */}
      <main className="px-4 pb-28">
        <div className="mx-auto w-full max-w-sm space-y-4">
          {/* 视频卡片：固定比例 + 圆角阴影，更现代 */}
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-sm ring-1 ring-black/5">
            {/* 3/4 比例，适合人脸取景且小屏不挤 */}
            <div className="aspect-[3/4] w-full">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
              />
            </div>

            {!cameraOn && (
              <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-sm p-6">
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-900">カメラが起動されていません</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    下の「Start Camera」を押してください
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 出勤/退勤：分段按钮（更省空间） */}
          <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectStatus(1)}
                className={[
                  'h-11 rounded-xl text-sm font-semibold transition',
                  selectedStatus === 1
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 active:bg-slate-200',
                ].join(' ')}
              >
                出勤
              </button>
              <button
                type="button"
                onClick={() => handleSelectStatus(2)}
                className={[
                  'h-11 rounded-xl text-sm font-semibold transition',
                  selectedStatus === 2
                    ? 'bg-pink-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 active:bg-slate-200',
                ].join(' ')}
              >
                退勤
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 底部粘性操作区：适配小屏 + safe area */}
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

          <p className="mt-2 text-center text-[11px] text-slate-500">
            位置情報とカメラを許可してください
          </p>
        </div>
      </div>

      {/* MUI 对话框 - 二重打刻 */}
      <Dialog open={overrideDialogOpen} onClose={handleOverrideCancel}>
        <DialogTitle style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          二重打刻の確認
        </DialogTitle>
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
