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
    //    - 1小时无交互 => navigate('/')
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
            // 1小时=3600000ms => 返回 '/'
            if (diff >= 3600000) {
                navigate('/');
            }
        }, 10_000);

        return () => clearInterval(idleCheckInterval);
    }, [buttonText, lastActivityTime, navigate]);

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
        setButtonClass(
            'mt-4 px-6 py-3 bg-gray-400 text-white font-semibold text-xl rounded-lg shadow-md cursor-not-allowed'
        );

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

            fetch('/api/record_attendance', {
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
                                fetch('/api/record_attendance', {
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
            setButtonClass(
                'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75'
            );
        } else {
            // 摄像头没启动
            setButtonText('Start Video');
            setButtonClass(
                'mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75'
            );
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
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10">

                {/* 二重打刻确认框 */}
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

                    {/* 出勤/退勤/主按钮 */}
                    <div className="flex space-x-6 mb-4">
                        {/* 出勤 */}
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

                        {/* 退勤 */}
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

                        {/* Start Video / 打刻開始 按钮 */}
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

                {/* Toast 容器 */}
                <ToastContainer />
            </div>
        </div>
    );
};

export default Attendance;
