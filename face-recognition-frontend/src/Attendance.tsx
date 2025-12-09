import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button
} from '@mui/material';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';
import { ToastContainer, toast, Id } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Attendance: React.FC = () => {
  const navigate = useNavigate();

  // 摄像头video
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 选择打刻类型：1=出勤, 2=退勤
  const [selectedStatus, setSelectedStatus] = useState<number>(0);

  // 主按钮文字 & 样式
  const [buttonText, setButtonText] = useState<string>('Start Video');
  const [buttonClass, setButtonClass] = useState<string>(
    'mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75'
  );
  const [isPunching, setIsPunching] = useState<boolean>(false);

  // 二重打刻覆盖用 Dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmCallback, setConfirmCallback] = useState<() => void>(() => {});

  // 打刻结果
  const [attendanceDetails, setAttendanceDetails] = useState({
    employee_number: '',
    employee_name: '',
    attendance_time: '',
    status: '',
  });

  // 防止自动判断出勤/退勤的手动覆盖
  const [manualOverride, setManualOverride] = useState<boolean>(false);

  // 记录最后一次用户交互时间
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());

  // 用于存储初始“摄像头未启动”提示的 toastId
  const [cameraOffToastId, setCameraOffToastId] = useState<Id | null>(null);

  // 出勤/退勤自动判断
  useEffect(() => {
    const checkStatus = () => {
      if (manualOverride) return;
      const currentHour = new Date().getHours();
      if (currentHour >= 4 && currentHour < 15) {
        if (selectedStatus !== 1) setSelectedStatus(1);
      } else {
        if (selectedStatus !== 2) setSelectedStatus(2);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [selectedStatus, manualOverride]);

  // Idle 检查
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      const diff = Date.now() - lastActivityTime;
      if (buttonText === '打刻開始') {
        if (diff >= 900000) {
          stopVideo();
        }
      }
      if (diff >= 3600000) {
        navigate('/');
      }
    }, 10000);
    return () => clearInterval(idleCheckInterval);
  }, [buttonText, lastActivityTime, navigate]);

  // 定期检测画面是否卡住
  useEffect(() => {
    const freezeCheckInterval = setInterval(() => {
      if (videoRef.current && buttonText === '打刻開始') {
        const videoElem = videoRef.current;
        const isFrozen = !(
          videoElem.readyState >= 2 &&
          !videoElem.paused &&
          !videoElem.ended
        );
        if (isFrozen) {
          console.log('Detected freeze, re-initialize camera...');
          stopVideo();
          startVideo();
        }
      }
    }, 60000);
    return () => clearInterval(freezeCheckInterval);
  }, [buttonText]);

  // 初始化时提示
  useEffect(() => {
    if (buttonText === 'Start Video') {
      if (!cameraOffToastId) {
        const newId = toast.info(
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            📷カメラがオフです。<br />
            👆Start Videoを押して起動してください。
          </div>,
          {
            autoClose: false,
            closeOnClick: false,
            draggable: false,
          }
        );
        setCameraOffToastId(newId);
      }
    } else {
      if (cameraOffToastId) {
        toast.dismiss(cameraOffToastId);
        setCameraOffToastId(null);
      }
    }
  }, [buttonText, cameraOffToastId]);

  const resetInactivityTimer = () => {
    setLastActivityTime(Date.now());
  };

  const playSuccessSound = () => {
    const audio = new Audio('/sounds/success-sound.mp3');
    audio.play().catch(err => {
      console.warn('Failed to play success audio:', err);
    });
  };
  const playAlertSound = () => {
    const audio = new Audio('/sounds/alert-sound.mp3');
    audio.play().catch(err => {
      console.warn('Failed to play alert audio:', err);
    });
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
    resetPunchingButton();
  };

  // 抓帧工具
  function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async function captureFrames(
    video: HTMLVideoElement,
    durationMs = 1800,
    intervalMs = 120,
    targetWidth = 640,
    jpegQuality = 0.7
  ): Promise<Blob[]> {
    const frames: Blob[] = [];
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = targetWidth ? targetWidth / vw : 1;
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    const start = Date.now();
    while (Date.now() - start < durationMs) {
      ctx.drawImage(video, 0, 0, cw, ch);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', jpegQuality);
      });
      frames.push(blob);
      await wait(intervalMs);
    }
    if (frames.length < 5) throw new Error('Not enough frames captured');
    return frames;
  }

  // 启动摄像头：请求更高分辨率与前置摄像头
  const startVideo = () => {
    resetInactivityTimer();
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .catch((err) => {
              console.warn('video.play() error:', err);
            });
        }
        setButtonText('打刻開始');
        setButtonClass(
          'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75'
        );
      })
      .catch((error) => {
        console.error('Something went wrong!', error);
        playAlertSound();
        toast.error(`ビデオを開始できません: ${error.message}`, {
          autoClose: 5000,
        });
      });
  };

  // 多帧 + PAD + 再识别
  const startAttendance = async () => {
    try {
      resetInactivityTimer();

      if (selectedStatus === 0) {
        playAlertSound();
        toast.error('打刻種類を選択してください', { autoClose: 5000 });
        return;
      }

      setIsPunching(true);
      setButtonText('打刻中...');
      setButtonClass(
        'mt-4 px-6 py-3 bg-gray-400 text-white font-semibold text-xl rounded-lg shadow-md cursor-not-allowed'
      );

      const video = videoRef.current;
      if (!video) {
        playAlertSound();
        toast.error('ビデオが準備できていません', { autoClose: 5000 });
        resetPunchingButton();
        return;
      }

      const deviceTime = new Date().toISOString();
      // 抓取连续帧
      const frames = await captureFrames(video, 1800, 120, 640, 0.7); // 约15帧

      const buildFormData = (withOverride = false) => {
        const fd = new FormData();
        fd.append('device_time_str', deviceTime);
        fd.append('status', selectedStatus.toString());
        if (withOverride) fd.append('override', 'true');
        frames.forEach((blob, i) => {
          fd.append('images', blob, `frame_${i}.jpg`);
        });
        return fd;
      };

      const sendOnce = async (formData: FormData) => {
        const res = await fetch('/api/record_attendance', { method: 'POST', body: formData });
        if (!res.ok) {
          let errJson: any = null;
          try { errJson = await res.json(); } catch {}
          const msg = errJson?.detail || errJson?.error || `打刻に失敗しました(HTTP ${res.status})`;
          throw new Error(msg);
        }
        return res.json();
      };

      const data = await sendOnce(buildFormData(false));

      if (data.error) {
        playAlertSound();
        toast.error(data.error, { autoClose: 5000 });
      } else if (data.override) {
        showConfirm(
          `あなたはすでに${data.status === '1' ? '出勤' : '退勤'}しました<br>前回の打刻時間: ${data.attendance_time}<br>前回の打刻情報を上書きしますか？`,
          async () => {
            try {
              const data2 = await sendOnce(buildFormData(true));
              if (data2.error) {
                playAlertSound();
                toast.error(data2.error, { autoClose: 5000 });
              } else {
                playSuccessSound();
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
              toast.error(`上書き操作に失敗しました: ${e.message}`, { autoClose: 5000 });
            }
          }
        );
      } else {
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
      }
    } catch (err: any) {
      console.error('Error:', err);
      playAlertSound();
      toast.error(`打刻に失敗しました: ${err.message}`, { autoClose: 5000 });
    } finally {
      resetPunchingButton();
    }
  };

  const resetPunchingButton = () => {
    setIsPunching(false);
    if (videoRef.current && videoRef.current.srcObject) {
      setButtonText('打刻開始');
      setButtonClass(
        'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75'
      );
    } else {
      setButtonText('Start Video');
      setButtonClass(
        'mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75'
      );
    }
  };

  // 用户手动选择 出勤/退勤
  const handleStatusClick = (status: number) => {
    resetInactivityTimer();
    setSelectedStatus(status);
    setManualOverride(true);
    setTimeout(() => {
      setManualOverride(false);
    }, 300000);
  };

  return (
    <div className="flex h-screen font-sans antialiased bg-gray-200">
      <Sidebar />
      <div className="flex-1 flex flex-col items-center justify-center p-10">

        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle style={{ fontSize: '1.5rem' }}>確認</DialogTitle>
          <DialogContent>
            <DialogContentText
              style={{ fontSize: '1.25rem' }}
              dangerouslySetInnerHTML={{ __html: confirmMessage }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setConfirmOpen(false)}
              style={{ backgroundColor: 'red', color: 'white', fontSize: '1.25rem' }}
            >
              NO
            </Button>
            <Button
              onClick={() => {
                confirmCallback();
                setConfirmOpen(false);
              }}
              style={{ backgroundColor: 'blue', color: 'white', fontSize: '1.25rem' }}
            >
              YES
            </Button>
          </DialogActions>
        </Dialog>

        <div className="flex flex-col items-center justify-center h-full">
          <video
            ref={videoRef}
            width="640"
            height="480"
            className="rounded-lg shadow-lg mb-4"
            autoPlay
            playsInline
          ></video>

          <div className="flex space-x-6 mb-4">
            <button
              className={`
                text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:bg-gradient-to-bl
                focus:outline-none font-medium text-2xl px-24 py-10 text-center transition-transform
                transform rounded-lg
                ${
                  selectedStatus === 1
                    ? 'scale-110 ring-4 ring-yellow-300 ring-offset-2 ring-offset-blue-500 border-4 border-white shadow-xl'
                    : 'shadow-md'
                }
              `}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusClick(1);
              }}
            >
              {selectedStatus === 1 ? '🚀 出勤' : '出勤'}
            </button>

            <button
              className={`
                text-white bg-gradient-to-br from-pink-500 to-orange-400 hover:bg-gradient-to-bl
                focus:outline-none font-medium text-2xl px-24 py-10 text-center transition-transform
                transform rounded-lg
                ${
                  selectedStatus === 2
                    ? 'scale-110 ring-4 ring-pink-300 ring-offset-2 ring-offset-orange-400 border-4 border-white shadow-xl'
                    : 'shadow-md'
                }
              `}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusClick(2);
              }}
            >
              {selectedStatus === 2 ? '🌙 退勤' : '退勤'}
            </button>

            <button
              onClick={buttonText === 'Start Video' ? startVideo : startAttendance}
              disabled={isPunching}
              className={`
                text-white font-semibold text-3xl
                px-16 py-8
                transition-transform transform
                focus:outline-none focus:ring-2 focus:ring-opacity-75
                rounded-full shadow-md
                ${
                  isPunching
                    ? 'bg-gray-400 cursor-not-allowed'
                    : buttonText === 'Start Video'
                      ? 'bg-green-500 hover:bg-green-700 focus:ring-green-500'
                      : 'bg-blue-500 hover:bg-blue-700 focus:ring-blue-500'
                }
              `}
            >
              {buttonText}
            </button>
          </div>
        </div>

        <ToastContainer />
      </div>
    </div>
  );
};

export default Attendance;