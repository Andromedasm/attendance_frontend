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

const PUNCH_TIMEOUT_MS = 30_000;
const CAMERA_TIMEOUT_MS = 10_000;
const CAPTURE_TIMEOUT_MS = 5_000;

class AttendanceTimeoutError extends Error {}
class AttendanceHttpError extends Error {}

type AttendanceResponse = {
    detail?: string;
    error?: string;
    override?: boolean;
    status?: string;
    employee_number?: string;
    employee_name?: string;
    attendance_time?: string;
};

// A separate deadline also works when a browser or proxy does not finish aborting fetch.
const withAttendanceTimeout = <T,>(
    operation: () => Promise<T>,
    signal: AbortSignal,
    timeoutMs: number,
    message: string,
): Promise<T> => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        callback();
    };
    const onAbort = () => finish(() => reject(new DOMException('操作を中止しました', 'AbortError')));
    const onTimeout = () => finish(() => reject(new AttendanceTimeoutError(message)));
    const timer = window.setTimeout(onTimeout, timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
        onAbort();
        return;
    }
    Promise.resolve().then(() => {
        if (signal.aborted) throw new DOMException('操作を中止しました', 'AbortError');
        return operation();
    }).then(
        value => {
            // Safari may suspend timers while the page is in the background.
            if (Date.now() >= deadline) onTimeout();
            else finish(() => resolve(value));
        },
        error => finish(() => reject(error)),
    );
});

const Attendance: React.FC = () => {
    const navigate = useNavigate();

    // 摄像头video
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const mountedRef = useRef(true);
    const activePunchRef = useRef<AbortController | null>(null);
    const cameraStartRef = useRef<AbortController | null>(null);
    const [isStartingCamera, setIsStartingCamera] = useState(false);

    useEffect(() => {
        mountedRef.current = true;
        const video = videoRef.current;
        return () => {
            mountedRef.current = false;
            activePunchRef.current?.abort();
            activePunchRef.current = null;
            cameraStartRef.current?.abort();
            cameraStartRef.current = null;
            const stream = video?.srcObject as MediaStream | null;
            stream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    // 选择打刻类型：1=出勤, 2=退勤
    const [selectedStatus, setSelectedStatus] = useState<number>(0);

    // 主按钮文字
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

        const timeout = window.setTimeout(() => {
            setAttendanceDetails({
                employee_number: '',
                employee_name: '',
                attendance_time: '',
                status: '',
            });
        }, 5000);

        return () => window.clearTimeout(timeout);
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
    //    - 1小时无交互 => navigate('/')
    //----------------------------------------------------------------
    useEffect(() => {
        const idleCheckInterval = setInterval(() => {
            const diff = Date.now() - lastActivityTime;
            // 若摄像头处于“打刻開始”状态
            // 这里调成 15 分钟 = 900000ms
            if (buttonText === '打刻開始' && !activePunchRef.current && !cameraStartRef.current) {
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
            if (videoRef.current && buttonText === '打刻開始' && !activePunchRef.current && !cameraStartRef.current) {
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
        cameraStartRef.current?.abort();
        cameraStartRef.current = null;
        setIsStartingCamera(false);
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
        }
        resetPunchingButton();
    };

    //----------------------------------------------------------------
    // 启动摄像头：播放成功后才允许打刻；超时后释放迟到的摄像头流。
    //----------------------------------------------------------------
    const startVideo = async () => {
        if (cameraStartRef.current || activePunchRef.current || !mountedRef.current) return;
        resetInactivityTimer();
        const controller = new AbortController();
        cameraStartRef.current = controller;
        setIsStartingCamera(true);
        let acquiredStream: MediaStream | undefined;
        try {
            await withAttendanceTimeout(async () => {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480 },
                });
                acquiredStream = stream;
                if (controller.signal.aborted || !mountedRef.current) {
                    stream.getTracks().forEach(track => track.stop());
                    throw new DOMException('操作を中止しました', 'AbortError');
                }
                const video = videoRef.current;
                if (!video) {
                    stream.getTracks().forEach(track => track.stop());
                    throw new Error('カメラを開始できません');
                }
                video.srcObject = stream;
                await video.play();
            }, controller.signal, CAMERA_TIMEOUT_MS, 'カメラの起動がタイムアウトしました');
            if (mountedRef.current && cameraStartRef.current === controller) {
                setButtonText('打刻開始');
            }
        } catch (error) {
            if (cameraStartRef.current !== controller || !mountedRef.current) return;
            acquiredStream?.getTracks().forEach(track => track.stop());
            const video = videoRef.current;
            if (video && video.srcObject === acquiredStream) video.srcObject = null;
            setButtonText('Start Video');
            playAlertSound();
            toast.error(`ビデオを開始できません: ${error instanceof Error ? error.message : String(error)}`, {
                autoClose: 5000,
            });
        } finally {
            controller.abort();
            if (cameraStartRef.current === controller) {
                cameraStartRef.current = null;
                if (mountedRef.current) setIsStartingCamera(false);
            }
        }
    };

    const captureAttendanceImage = (signal: AbortSignal): Promise<Blob> => {
        return withAttendanceTimeout(() => new Promise<Blob>((resolve, reject) => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
                reject(new Error('カメラの映像が準備できていません。映像を確認してから再操作してください'));
                return;
            }
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) {
                reject(new Error('画像取得に失敗しました'));
                return;
            }
            // Keep the original lossless PNG input to avoid changing recognition quality.
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('画像取得に失敗しました'));
            }, 'image/png');
        }), signal, CAPTURE_TIMEOUT_MS, '画像の取得がタイムアウトしました。カメラの映像を確認してください');
    };

    const showAttendanceSuccess = (data: AttendanceResponse, punchStatus: number) => {
        playSuccessSound();
        setAttendanceDetails({
            employee_number: data.employee_number || '',
            employee_name: data.employee_name || '',
            attendance_time: data.attendance_time || '',
            status: punchStatus === 1 ? '出勤' : '退勤',
        });
        toast.success(
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                打刻記録が成功しました<br />
                社員番号: {data.employee_number}<br />
                社員名: {data.employee_name}<br />
                打刻時間: {data.attendance_time}<br />
                打刻種類: {punchStatus === 1 ? '出勤' : '退勤'}
            </div>,
            { autoClose: 5000 }
        );
    };

    //----------------------------------------------------------------
    // 初回と上書きの両方に同じ期限・排他制御を適用する。自動再送はしない。
    //----------------------------------------------------------------
    const submitAttendance = async (punchStatus: number, previousForm?: FormData) => {
        if (activePunchRef.current || cameraStartRef.current || !mountedRef.current) return;
        const controller = new AbortController();
        activePunchRef.current = controller;
        setIsPunching(true);
        setButtonText('打刻中...');
        let submitted = false;
        try {
            const { data, formData } = await withAttendanceTimeout(async () => {
                const formData = previousForm || new FormData();
                if (previousForm) {
                    formData.set('override', 'true');
                } else {
                    const blob = await captureAttendanceImage(controller.signal);
                    formData.append('device_time_str', new Date().toISOString());
                    formData.append('image', blob, 'attendance.png');
                    formData.append('status', punchStatus.toString());
                }
                if (controller.signal.aborted) throw new DOMException('操作を中止しました', 'AbortError');
                submitted = true;
                const response = await fetch('/api/record_attendance', {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal,
                });
                // The same deadline covers response.json(), not just receipt of headers.
                let data: AttendanceResponse;
                try {
                    data = await response.json();
                } catch (error) {
                    if (!response.ok) throw new AttendanceHttpError('打刻に失敗しました(未知エラー)');
                    throw error;
                }
                if (!response.ok) {
                    throw new AttendanceHttpError(data?.detail || data?.error || '打刻に失敗しました(未知エラー)');
                }
                if (!data || typeof data !== 'object') throw new Error('サーバーの応答を確認できません');
                return { data, formData };
            }, controller.signal, PUNCH_TIMEOUT_MS, '通信がタイムアウトしました');

            if (!mountedRef.current || activePunchRef.current !== controller) return;
            if (data.error) {
                playAlertSound();
                toast.error(data.error, { autoClose: 5000 });
            } else if (data.override && !previousForm) {
                showConfirm(
                    `あなたはすでに${data.status === '1' ? '出勤' : '退勤'}しました<br>前回の打刻時間: ${
                        data.attendance_time
                    }<br>前回の打刻情報を上書きしますか？`,
                    () => { void submitAttendance(punchStatus, formData); }
                );
            } else {
                showAttendanceSuccess(data, punchStatus);
            }
        } catch (error) {
            if (!mountedRef.current || activePunchRef.current !== controller) return;
            console.error('Attendance error:', error);
            playAlertSound();
            const resultUncertain = submitted && !(error instanceof AttendanceHttpError);
            const detail = error instanceof Error ? error.message : String(error);
            toast.error(
                resultUncertain
                    ? `${detail}。打刻が記録されている可能性があります。打刻履歴を確認してから再操作してください。`
                    : `${previousForm ? '上書き操作' : '打刻'}に失敗しました: ${detail}`,
                { autoClose: resultUncertain ? false : 5000 }
            );
        } finally {
            // Stop remaining capture/network work; a late response cannot update the UI.
            controller.abort();
            if (activePunchRef.current === controller) {
                activePunchRef.current = null;
                if (mountedRef.current) resetPunchingButton();
            }
        }
    };

    const startAttendance = () => {
        resetInactivityTimer();
        if (selectedStatus === 0) {
            playAlertSound();
            toast.error('打刻種類を選択してください', { autoClose: 5000 });
            return;
        }
        void submitAttendance(selectedStatus);
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
                    <div className="mb-4 flex gap-6">
                        {/* 出勤 */}
                        <button
                            className={`
                                text-white bg-linear-to-r from-cyan-500 to-blue-500 hover:bg-linear-to-bl
                                focus:outline-hidden font-medium text-2xl px-24 py-10 text-center transition-transform
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
                                text-white bg-linear-to-br from-pink-500 to-orange-400 hover:bg-linear-to-bl
                                focus:outline-hidden font-medium text-2xl px-24 py-10 text-center transition-transform
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
                            disabled={isPunching || isStartingCamera}
                            className={`
                                text-white font-semibold text-3xl
                                px-16 py-8
                                transition-transform transform
                                focus:outline-hidden focus:ring-2 focus:ring-white/75
                                rounded-full shadow-md
                                ${
                                    isPunching || isStartingCamera
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : buttonText === 'Start Video'
                                        ? 'bg-green-500 hover:bg-green-700'
                                            : 'bg-blue-500 hover:bg-blue-700'
                                }
                            `}
                        >
                            {isStartingCamera ? 'カメラ起動中...' : buttonText}
                        </button>
                    </div>

                    {attendanceDetails.employee_number && (
                        <section
                            className="mt-4 w-full max-w-3xl rounded-2xl border border-white/60 bg-white/75 px-6 py-4 shadow-lg backdrop-blur-xl"
                            aria-live="polite"
                        >
                            <p className="mb-3 text-sm font-bold tracking-[0.2em] text-emerald-700">
                                打刻完了
                            </p>
                            <dl className="grid gap-3 text-slate-700 sm:grid-cols-4">
                                <div>
                                    <dt className="text-xs text-slate-500">社員番号</dt>
                                    <dd className="font-semibold">{attendanceDetails.employee_number}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">社員名</dt>
                                    <dd className="font-semibold">{attendanceDetails.employee_name}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">打刻時間</dt>
                                    <dd className="font-semibold">{attendanceDetails.attendance_time}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">打刻種類</dt>
                                    <dd className="font-semibold">{attendanceDetails.status}</dd>
                                </div>
                            </dl>
                        </section>
                    )}
                </div>

                {/* Toast 容器 */}
                <ToastContainer />
            </div>
        </div>
    );
};

export default Attendance;
