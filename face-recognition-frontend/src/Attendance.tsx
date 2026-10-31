import React, { useRef, useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import FaceRecognitionIcon from './FaceRecognitionIcon';
import ThemeBackdrop from './ThemeBackdrop';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './theme-context';
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
import './recognition.scss';
import './attendance.scss';

import { ToastContainer, toast, Id } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const ATTENDANCE_UI_STORAGE_KEY = 'face-attendance-ui';

const Attendance: React.FC = () => {
    const { theme } = useTheme();
    const [uiMode, setUiMode] = useState<'legacy' | 'modern'>(() => {
        try {
            return window.localStorage.getItem(ATTENDANCE_UI_STORAGE_KEY) === 'modern' ? 'modern' : 'legacy';
        } catch {
            return 'legacy';
        }
    });
    const isModern = uiMode === 'modern';
    const toggleUiMode = () => {
        const nextMode = isModern ? 'legacy' : 'modern';
        setUiMode(nextMode);
        try {
            window.localStorage.setItem(ATTENDANCE_UI_STORAGE_KEY, nextMode);
        } catch {
            // Switching layouts still works when browser storage is unavailable.
        }
    };
    // 摄像头video
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // 选择打刻类型：1=出勤, 2=退勤
    const [selectedStatus, setSelectedStatus] = useState<number>(0);

    // 主按钮文字 & 样式
    const [buttonText, setButtonText] = useState<string>('Start Video');
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

    useEffect(() => {
        if (!attendanceDetails.employee_number) return;
        const timer = window.setTimeout(() => setAttendanceDetails({
            employee_number: '', employee_name: '', attendance_time: '', status: '',
        }), 5000);
        return () => window.clearTimeout(timer);
    }, [attendanceDetails]);

    // 防止自动判断出勤/退勤的手动覆盖
    const [manualOverride, setManualOverride] = useState<boolean>(false);

    // 记录最后一次用户交互时间
    const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());

    // 用于存储初始“摄像头未启动”提示的 toastId
    const [cameraOffToastId, setCameraOffToastId] = useState<Id | null>(null);

    //----------------------------------------------------------------
    // 1) 出勤/退勤自动判断 (每分钟)
    //----------------------------------------------------------------
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

    //----------------------------------------------------------------
    // 2) Idle 检查 (每 10 秒):
    //    - 15分钟无交互 => stopVideo()
    //----------------------------------------------------------------
    useEffect(() => {
        const idleCheckInterval = setInterval(() => {
            const diff = Date.now() - lastActivityTime;
            // 若摄像头处于“打刻開始”状态
            // 这里调成 15 分钟 = 900000ms
            if (buttonText === '打刻開始') {
                if (diff >= 900000) {
                    stopVideo();
                }
            }
        }, 10_000);

        return () => clearInterval(idleCheckInterval);
    }, [buttonText, lastActivityTime]);

    //----------------------------------------------------------------
    // 3) 定期(1分钟)检测画面是否卡住，若卡住则自动重启流
    //----------------------------------------------------------------
    useEffect(() => {
        const freezeCheckInterval = setInterval(() => {
            // 只有当摄像头真正打开时才检测
            if (videoRef.current && buttonText === '打刻開始') {
                const videoElem = videoRef.current;
                // 简单判断: readyState >=2, !paused, !ended => 正在播放
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
        }, 60_000); // 每 1 分钟检测一次

        return () => clearInterval(freezeCheckInterval);
    }, [buttonText]);

    //----------------------------------------------------------------
    // 初始化时，若摄像头没启动 => 显示常驻Toast
    // 启动后 => 关闭该提示
    //----------------------------------------------------------------
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
            // 摄像头已启动 => 若之前有常驻Toast，则关闭
            if (cameraOffToastId) {
                toast.dismiss(cameraOffToastId);
                setCameraOffToastId(null);
            }
        }
    }, [buttonText, cameraOffToastId]);

    //----------------------------------------------------------------
    // 交互 => 重置 lastActivityTime
    //----------------------------------------------------------------
    const resetInactivityTimer = () => {
        setLastActivityTime(Date.now());
    };

    //----------------------------------------------------------------
    // 音频: 按需创建并播放
    //----------------------------------------------------------------
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

    //----------------------------------------------------------------
    // 二重打刻覆盖确认对话框
    //----------------------------------------------------------------
    const showConfirm = (msg: string, callback: () => void) => {
        setConfirmMessage(msg);
        setConfirmCallback(() => callback);
        setConfirmOpen(true);
    };

    //----------------------------------------------------------------
    // 停止摄像头
    //----------------------------------------------------------------
    const stopVideo = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
        }
        resetPunchingButton();
    };

    //----------------------------------------------------------------
    // 启动摄像头 (在点击事件回调中立即 .play())
    //----------------------------------------------------------------
    const startVideo = () => {
        resetInactivityTimer();
        navigator.mediaDevices
            .getUserMedia({ video: { width: 640, height: 480 } })
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
            })
            .catch((error) => {
                console.error('Something went wrong!', error);
                playAlertSound();
                toast.error(`ビデオを開始できません: ${error.message}`, {
                    autoClose: 5000,
                });
            });
    };

    //----------------------------------------------------------------
    // 执行打刻
    //----------------------------------------------------------------
    const startAttendance = () => {
        resetInactivityTimer();

        if (selectedStatus === 0) {
            playAlertSound();
            toast.error('打刻種類を選択してください', {
                autoClose: 5000,
            });
            return;
        }

        setIsPunching(true);
        setButtonText('打刻中...');

        const video = videoRef.current;
        if (!video) {
            playAlertSound();
            toast.error('ビデオが準備できていません', {
                autoClose: 5000,
            });
            resetPunchingButton();
            return;
        }

        // 截图
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) {
                playAlertSound();
                toast.error('画像取得に失敗しました', {
                    autoClose: 5000,
                });
                resetPunchingButton();
                return;
            }

            const formData = new FormData();
            const deviceTime = new Date().toISOString();

            // 改动1: 使用 device_time_str => 与后端一致
            formData.append('device_time_str', deviceTime);
            formData.append('image', blob);
            formData.append('status', selectedStatus.toString());

            fetch('/facerecapi/record_attendance', {
                method: 'POST',
                body: formData,
            })
                // 改动2: 先判断 res.ok => 如果非2xx => 解析后抛异常 => 进入catch
                .then(async (res) => {
                    if (!res.ok) {
                        let errJson: any = null;
                        try {
                            errJson = await res.json();
                        } catch (e) {
                            // 如果无法解析 json
                        }
                        const msg = errJson?.detail || errJson?.error || '打刻に失敗しました(未知エラー)';
                        throw new Error(msg);
                    }
                    // 否则 => 解析成功
                    return res.json();
                })
                .then((data) => {
                    if (data.error) {
                        playAlertSound();
                        toast.error(data.error, { autoClose: 5000 });
                    } else if (data.override) {
                        // 二重打刻 -> 询问覆盖
                        showConfirm(
                            `あなたはすでに${data.status === '1' ? '出勤' : '退勤'}しました<br>前回の打刻時間: ${
                                data.attendance_time
                            }<br>前回の打刻情報を上書きしますか？`,
                            () => {
                                formData.append('override', 'true');
                                fetch('/facerecapi/record_attendance', {
                                    method: 'POST',
                                    body: formData,
                                })
                                    .then(async (resp) => {
                                        if (!resp.ok) {
                                            let errJ: any = null;
                                            try {
                                                errJ = await resp.json();
                                            } catch (e) {}
                                            const msg = errJ?.detail || errJ?.error || '上書きに失敗しました';
                                            throw new Error(msg);
                                        }
                                        return resp.json();
                                    })
                                    .then((data2) => {
                                        if (data2.error) {
                                            playAlertSound();
                                            toast.error(data2.error, {
                                                autoClose: 5000,
                                            });
                                        } else {
                                            // 覆盖成功 -> 播放成功音 + Toast
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
                              打刻種類: ${
                                                            selectedStatus === 1 ? '出勤' : '退勤'
                                                        }
                            </span>`,
                                                    }}
                                                />,
                                                { autoClose: 5000 }
                                            );
                                        }
                                    })
                                    .catch((error) => {
                                        playAlertSound();
                                        toast.error(`上書き操作に失敗しました: ${error.message}`, {
                                            autoClose: 5000,
                                        });
                                    });
                            }
                        );
                    } else {
                        // 打刻成功
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
                })
                .catch((error) => {
                    console.error('Error:', error);
                    playAlertSound();
                    toast.error(`打刻に失敗しました: ${error.message}`, {
                        autoClose: 5000,
                    });
                })
                .finally(() => {
                    resetPunchingButton();
                });
        });
    };

    //----------------------------------------------------------------
    // 重置按钮
    //----------------------------------------------------------------
    const resetPunchingButton = () => {
        setIsPunching(false);
        if (videoRef.current && videoRef.current.srcObject) {
            // 摄像头已启动
            setButtonText('打刻開始');
        } else {
            // 摄像头没启动
            setButtonText('Start Video');
        }
    };

    //----------------------------------------------------------------
    // 用户手动选择 出勤/退勤
    //----------------------------------------------------------------
    const handleStatusClick = (status: number) => {
        resetInactivityTimer();
        setSelectedStatus(status);
        setManualOverride(true);
        setTimeout(() => {
            setManualOverride(false);
        }, 300000);
    };

    return (
        <div
            className={isModern
                ? 'theme-surface recognition-surface attendance-surface--modern'
                : 'flex h-screen font-sans antialiased bg-gray-200'}
            data-theme={isModern ? theme : undefined}
        >
            <Sidebar />
            <button
                type="button"
                className={`attendance-ui-toggle${isModern ? ' attendance-ui-toggle--modern' : ''}`}
                onClick={toggleUiMode}
                aria-label={isModern ? '従来のデザインに切り替える' : '新しいデザインに切り替える'}
                title={isModern ? '従来のデザインに切り替える' : '新しいデザインに切り替える'}
                aria-pressed={isModern}
            >
                <i className={`fa-solid ${isModern ? 'fa-table-cells-large' : 'fa-wand-magic-sparkles'}`} aria-hidden="true" />
            </button>
            {isModern && <ThemeToggle />}
            {isModern && <ThemeBackdrop />}
            <div className={isModern ? 'recognition-main attendance-main' : 'flex-1 flex flex-col items-center justify-center p-10'}>
                <Dialog
                    open={confirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    maxWidth="md"
                    fullWidth
                    slotProps={{ paper: { className: isModern ? 'recognition-dialog attendance-dialog' : undefined } }}
                >
                    <DialogTitle style={{ fontSize: '1.5rem' }}>打刻の上書き確認</DialogTitle>
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

                <div className={isModern ? 'recognition-panel attendance-panel' : 'flex flex-col items-center justify-center h-full'}>
                    <video
                        ref={videoRef}
                        width="640"
                        height="480"
                        className={isModern ? 'attendance-preview' : 'rounded-lg shadow-lg mb-4'}
                        autoPlay
                        playsInline
                    />
                    <div className={isModern ? 'attendance-actions' : 'mb-4 flex gap-6'}>
                        <button
                            type="button"
                            aria-pressed={selectedStatus === 1}
                            className={isModern
                                ? `attendance-status attendance-status--in${selectedStatus === 1 ? ' is-selected' : ''}`
                                : `
                                    text-white bg-linear-to-r from-cyan-500 to-blue-500 hover:bg-linear-to-bl
                                    focus:outline-hidden font-medium text-2xl px-24 py-10 text-center transition-transform
                                    transform rounded-lg
                                    ${selectedStatus === 1 ? 'scale-110 ring-4 ring-yellow-300 ring-offset-2 ring-offset-blue-500 border-4 border-white shadow-xl' : 'shadow-md'}
                                `}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleStatusClick(1);
                            }}
                        >
                            {isModern && <i className="fa-solid fa-arrow-right-to-bracket" aria-hidden="true" />}
                            {isModern ? '出勤' : selectedStatus === 1 ? '🚀 出勤' : '出勤'}
                        </button>
                        <button
                            type="button"
                            aria-pressed={selectedStatus === 2}
                            className={isModern
                                ? `attendance-status attendance-status--out${selectedStatus === 2 ? ' is-selected' : ''}`
                                : `
                                    text-white bg-linear-to-br from-pink-500 to-orange-400 hover:bg-linear-to-bl
                                    focus:outline-hidden font-medium text-2xl px-24 py-10 text-center transition-transform
                                    transform rounded-lg
                                    ${selectedStatus === 2 ? 'scale-110 ring-4 ring-pink-300 ring-offset-2 ring-offset-orange-400 border-4 border-white shadow-xl' : 'shadow-md'}
                                `}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleStatusClick(2);
                            }}
                        >
                            {isModern && <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />}
                            {isModern ? '退勤' : selectedStatus === 2 ? '🌙 退勤' : '退勤'}
                        </button>
                        <button
                            type="button"
                            onClick={buttonText === 'Start Video' ? startVideo : startAttendance}
                            disabled={isPunching}
                            className={isModern
                                ? `recognition-button attendance-punch ${buttonText === 'Start Video' ? 'recognition-button--start' : 'recognition-button--primary'}`
                                : `
                                    text-white font-semibold text-3xl px-16 py-8 transition-transform transform
                                    focus:outline-hidden focus:ring-2 focus:ring-white/75 rounded-full shadow-md
                                    ${isPunching ? 'bg-gray-400 cursor-not-allowed' : buttonText === 'Start Video' ? 'bg-green-500 hover:bg-green-700' : 'bg-blue-500 hover:bg-blue-700'}
                                `}
                        >
                            {isModern && <FaceRecognitionIcon className="attendance-punch-icon" />}
                            {buttonText}
                        </button>
                    </div>
                    {buttonText !== 'Start Video' && (
                        <button
                            type="button"
                            className={isModern ? 'attendance-restart' : 'mb-3 text-sm underline text-slate-600'}
                            disabled={isPunching}
                            onClick={() => { stopVideo(); startVideo(); }}
                        >
                            カメラを再起動
                        </button>
                    )}
                    {attendanceDetails.employee_number && (
                        <section
                            className={isModern ? 'attendance-results' : 'mt-4 w-full max-w-3xl rounded-2xl border border-white/60 bg-white/75 px-6 py-4 shadow-lg backdrop-blur-xl'}
                            aria-live="polite"
                        >
                            <p className={isModern ? 'attendance-results-title' : 'mb-3 text-sm font-bold tracking-[0.2em] text-emerald-700'}>打刻完了</p>
                            <dl className={isModern ? 'attendance-result-row' : 'mb-3 grid gap-3 text-slate-700 sm:grid-cols-4'}>
                                <div><dt className={isModern ? 'attendance-result-label' : 'text-xs text-slate-500'}>社員番号</dt><dd className="font-semibold">{attendanceDetails.employee_number}</dd></div>
                                <div><dt className={isModern ? 'attendance-result-label' : 'text-xs text-slate-500'}>社員名</dt><dd className="font-semibold">{attendanceDetails.employee_name}</dd></div>
                                <div><dt className={isModern ? 'attendance-result-label' : 'text-xs text-slate-500'}>打刻時間</dt><dd className="font-semibold">{attendanceDetails.attendance_time}</dd></div>
                                <div><dt className={isModern ? 'attendance-result-label' : 'text-xs text-slate-500'}>打刻種類</dt><dd className="font-semibold">{attendanceDetails.status}</dd></div>
                            </dl>
                        </section>
                    )}
                </div>
                <ToastContainer className="attendance-toast-container" theme={theme} />
            </div>
        </div>
    );
};

export default Attendance;
