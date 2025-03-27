// MobileAttendance.tsx

import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// MUI 组件
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
        if (now - lastManualTime < 15 * 60 * 1000) {
          return;
        } else {
          setManualOverride(false);
        }
      }
      const currentHour = new Date().getHours();
      if (currentHour >= 4 && currentHour < 15) {
        setSelectedStatus(1);
      } else {
        setSelectedStatus(2);
      }
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

  const resetInactivityTimer = () => {
    setLastActivityTime(Date.now());
  };

  // -------------------------------------------
  // 打开摄像头
  // -------------------------------------------
  const startCamera = async () => {
    resetInactivityTimer();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setButtonText('打刻開始');
    } catch (err: any) {
      console.error('startCamera error:', err);
      toast.error(`カメラ起動失敗: ${err.message}`);
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

          // 第一次请求
          const formData = new FormData();
          formData.append('image', blob);
          formData.append('status', selectedStatus.toString());
          formData.append('device_time', new Date().toISOString());
          formData.append('lat', latVal.toString());
          formData.append('lon', lonVal.toString());

          fetch('/facerecapi/mobile_attendance', {
            method: 'POST',
            body: formData,
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.override) {
                // 二重打刻 => 显示 MUI Dialog
                setOverrideData({
                  attendance_time: data.attendance_time,
                  status: data.status,
                  blob,
                  latVal,
                  lonVal,
                });
                setOverrideDialogOpen(true);
              } else if (data.error || data.detail) {
                // 错误
                toast.error(data.error || data.detail);
                resetPunchButton();
              } else {
                // 打卡成功
                toast.success(`打刻成功：${data.employee_name} - ${data.attendance_time}`);
                resetPunchButton();
              }
            })
            .catch((err) => {
              toast.error(`打刻失敗: ${err.message}`);
              resetPunchButton();
            });
        });
      },
      (err) => {
        toast.error(`地理位置取得失敗: ${err.message}`);
        resetPunchButton();
      }
    );
  };

  // -------------------------------------------
  // 二重打刻 => 用户点击 YES
  // -------------------------------------------
  const handleOverrideConfirm = () => {
    if (!overrideData) return;
    const { blob, latVal, lonVal, status } = overrideData;

    // 二次请求 => override=true
    const overrideFormData = new FormData();
    overrideFormData.append('image', blob!);
    overrideFormData.append('status', status);
    overrideFormData.append('device_time', new Date().toISOString());
    overrideFormData.append('override', 'true');
    overrideFormData.append('lat', latVal!.toString());
    overrideFormData.append('lon', lonVal!.toString());

    fetch('/facerecapi/mobile_attendance', {
      method: 'POST',
      body: overrideFormData,
    })
      .then((res2) => res2.json())
      .then((data2) => {
        if (data2.error || data2.detail) {
          toast.error(data2.error || data2.detail);
        } else {
          toast.success(`打刻成功：${data2.employee_name} - ${data2.attendance_time}`);
        }
      })
      .catch((err2) => {
        toast.error(`打刻失敗: ${err2.message}`);
      })
      .finally(() => {
        resetPunchButton();
        setOverrideDialogOpen(false);
        setOverrideData(null);
      });
  };

  // -------------------------------------------
  // 二重打刻 => 用户点击 NO
  // -------------------------------------------
  const handleOverrideCancel = () => {
    toast.info('上書きキャンセルしました。');
    resetPunchButton();
    setOverrideDialogOpen(false);
    setOverrideData(null);
  };

  // -------------------------------------------
  // 重置按钮
  // -------------------------------------------
  const resetPunchButton = () => {
    setIsPunching(false);
    if (videoRef.current?.srcObject) {
      setButtonText('打刻開始');
    } else {
      setButtonText('Start Camera');
    }
  };

  // -------------------------------------------
  // 用户手动选择 出勤 / 退勤
  // -------------------------------------------
  const handleSelectStatus = (status: number) => {
    resetInactivityTimer();
    setSelectedStatus(status);
    setManualOverride(true);
    setLastManualTime(Date.now());
  };

  // -------------------------------------------
  // Tailwind 样式
  // -------------------------------------------
  const getAttendanceBtnClass = (btnStatus: number) => {
    let baseClass = 'text-2xl px-10 py-6 rounded-full transition-all';
    if (btnStatus === 1) {
      if (selectedStatus === 1) {
        baseClass += ' bg-blue-600 text-white scale-105 ring-4 ring-blue-300';
      } else {
        baseClass += ' bg-gray-300';
      }
    } else {
      if (selectedStatus === 2) {
        baseClass += ' bg-pink-600 text-white scale-105 ring-4 ring-pink-300';
      } else {
        baseClass += ' bg-gray-300';
      }
    }
    return baseClass;
  };

  const getMainButtonClass = () => {
    let baseClass =
      'text-2xl px-10 py-6 text-white transition-all rounded-full ' +
      'focus:outline-none focus:ring-2 focus:ring-offset-2';

    if (buttonText === 'Start Camera') {
      baseClass +=
        ' bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600';
    } else if (buttonText === '打刻開始' || buttonText === '打刻中...') {
      baseClass +=
        ' bg-gradient-to-r from-blue-400 to-purple-500 hover:from-blue-500 hover:to-purple-600';
    }
    return baseClass;
  };

  const isCameraActive = !!videoRef.current?.srcObject;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 bg-white">

      {/* 视频容器，设置 360×320 */}
      <div className="relative border rounded mb-4" style={{ width: 360, height: 320 }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover rounded"
          autoPlay
          playsInline
        ></video>
        {!isCameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <p className="text-center text-xl text-gray-700 font-semibold">
              カメラが起動されていません。<br />
              「Start Camera」ボタンを押してください。
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-8 mb-6">
        <button
          className={getAttendanceBtnClass(1)}
          onClick={() => handleSelectStatus(1)}
        >
          出勤
        </button>
        <button
          className={getAttendanceBtnClass(2)}
          onClick={() => handleSelectStatus(2)}
        >
          退勤
        </button>
      </div>

      <button
        onClick={buttonText === 'Start Camera' ? startCamera : handlePunch}
        disabled={isPunching}
        className={getMainButtonClass()}
      >
        {buttonText}
      </button>

      {/* MUI 对话框 - 二重打刻 */}
      <Dialog open={overrideDialogOpen} onClose={handleOverrideCancel}>
        <DialogTitle style={{ fontSize: '1.5rem', fontWeight: 600 }}>
          二重打刻の確認
        </DialogTitle>
        <DialogContent>
          {overrideData && (
            <p style={{ fontSize: '1.25rem', margin: 0, whiteSpace: 'pre-line' }}>
              既に
              {overrideData.status === '1' ? '出勤' : '退勤'}
              打刻があります。{'\n'}
              前回打刻時間: {overrideData.attendance_time}{'\n'}
              上書きしますか？
            </p>
          )}
        </DialogContent>
        <DialogActions>
          {/* NO 按钮 => 红色 */}
          <Button
            onClick={handleOverrideCancel}
            style={{
              backgroundColor: 'red',
              color: 'white',
              fontSize: '1.25rem',
              marginRight: '0.5rem',
            }}
          >
            NO
          </Button>

          {/* YES 按钮 => 蓝色 */}
          <Button
            onClick={handleOverrideConfirm}
            style={{
              backgroundColor: 'blue',
              color: 'white',
              fontSize: '1.25rem',
            }}
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
