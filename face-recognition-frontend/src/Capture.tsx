import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import ThemeBackdrop from './ThemeBackdrop';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './theme-context';
import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Button,
} from '@mui/material';

import './styles.scss';
import './recognition.scss';

// 引入 react-toastify
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface FaceMatch {
    employee_number: string | number;
    employee_name: string;
    similarity?: number;
}

const Capture: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const { theme } = useTheme();

    // 待输入的员工编号、姓名
    const [employeeNumber, setEmployeeNumber] = useState('');
    const [employeeName, setEmployeeName] = useState('');
    const [message, setMessage] = useState(''); // 显示"取得した社員名"或"見つかりません"等
    const [status, setStatus] = useState('');  // 显示"アップロード中..."等
    const [videoStarted, setVideoStarted] = useState(false);

    // 确认框 (保留原先逻辑)
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmMessage, setConfirmMessage] = useState('');
    const [confirmCallback, setConfirmCallback] = useState<() => void>(() => {});

    // 控制“登録開始”按钮
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerBtnText, setRegisterBtnText] = useState('登録開始');

    useEffect(() => {
        return () => {
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    // toast 帮助函数
    const showToastError = (msg: string) => {
        toast.error(msg, { autoClose: 5000 });
    };
    const showToastSuccess = (html: string) => {
        toast.success(<div dangerouslySetInnerHTML={{ __html: html }} />, { autoClose: 5000 });
    };
    const showToastInfo = (html: string) => {
        toast.info(<div dangerouslySetInnerHTML={{ __html: html }} />, { autoClose: 5000 });
    };

    // 确认框
    const showConfirm = (msg: string, callback: () => void) => {
        setConfirmMessage(msg);
        setConfirmCallback(() => callback);
        setConfirmOpen(true);
    };

    // 当 employeeNumber 改变时，自动获取数据库中姓名
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
            // 若输入为空，清空姓名
            setEmployeeName('');
            setMessage('');
        }
    };

    // 启动摄像头
    const startVideo = () => {
        navigator.mediaDevices
            .getUserMedia({ video: { width: 640, height: 480 } })
            .then((stream) => {
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setVideoStarted(true);
                }
            })
            .catch((error) => {
                console.error('Error accessing media devices.', error);
                showToastError('ビデオを開始できません: ' + error.message);
            });
    };

    // ================== 注册人脸 (capture) ==================
    const capture = () => {
        if (!employeeNumber.trim() || !employeeName.trim()) {
            showToastError('社員番号と名前を記入してください.');
            return;
        }

        // 按钮进入“注册中”状态
        setIsRegistering(true);
        setRegisterBtnText('登録中...');
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

            fetch('/api/upload', {
                method: 'POST',
                body: formData,
            })
                .then((response) => {
                    if (!response.ok) {
                        throw response;
                    }
                    return response.json();
                })
                .then((data) => {
                    setStatus('');
                    if (data.similar) {
                        // 存在相似人脸 => 用确认框
                        const matchesInfo = data.matches
                            .map(
                                (match: FaceMatch) =>
                                    `社員番号: ${match.employee_number}, 名前: ${match.employee_name}, 類似度: ${
                                        match.similarity?.toFixed(2) ?? 'N/A'
                                    }`
                            )
                            .join('<br />');

                        showConfirm(
                            `類似な顔が存在します:<br />${matchesInfo}<br />アップロードしますか?`,
                            () => {
                                // 用户点击YES => 加一个 override = true 再上传
                                formData.append('override', 'true');
                                fetch('/api/upload', {
                                    method: 'POST',
                                    body: formData,
                                })
                                    .then((resp) => resp.json())
                                    .then((data2) => {
                                        showToastInfo(data2.message);
                                    })
                                    .catch((error) => {
                                        showToastError('アップロードに失敗しました: ' + error.message);
                                    });
                            }
                        );
                    } else {
                        // 注册成功(或失败信息)
                        showToastInfo(data.message);
                    }
                })
                .catch((error) => {
                    setStatus('');
                    if (error.json) {
                        // 如果error是Response对象
                        error.json().then((body: { error?: string }) => {
                            showToastError(body.error ?? 'アップロードに失敗しました');
                        });
                    } else {
                        console.error('Error uploading the image.', error);
                        showToastError(error.message);
                    }
                })
                .finally(() => {
                    // 请求结束后恢复按钮
                    resetRegisterButton();
                });
        });
    };

    // 重置“登録開始”按钮
    const resetRegisterButton = () => {
        setIsRegistering(false);
        setStatus('');
        setRegisterBtnText('登録開始');
    };

    // ================== 验证人脸 (verify) ==================
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

            fetch('/api/verify', {
                method: 'POST',
                body: formData,
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.error) {
                        showToastError('認証失敗: ' + data.error);
                    } else if (data.found_faces?.length > 0) {
                        // 多个 or 单个都显示
                        const info = data.found_faces
                            .map(
                                (f: FaceMatch) =>
                                    `社員番号: ${f.employee_number}, 名前: ${f.employee_name}, 類似度: ${
                                        f.similarity?.toFixed(2) ?? 'N/A'
                                    }`
                            )
                            .join('<br/>');
                        showToastSuccess(`以下の顔が認証されました:<br/>${info}`);
                    } else if (data.message) {
                        // 可能是 "一致する顔が見つかりませんでした"
                        showToastInfo(data.message);
                    } else {
                        showToastInfo('認証結果を取得できませんでした');
                    }
                })
                .catch((err) => {
                    console.error(err);
                    showToastError('認証エラー: ' + err.message);
                });
        });
    };

    return (
        <div className="theme-surface recognition-surface" data-theme={theme}>
            <Sidebar />
            <ThemeToggle />
            <ThemeBackdrop />

            <Dialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                maxWidth="md"
                fullWidth
                slotProps={{ paper: { className: 'recognition-dialog' } }}
            >
                <DialogTitle>確認</DialogTitle>
                <DialogContent>
                    <DialogContentText dangerouslySetInnerHTML={{ __html: confirmMessage }} />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setConfirmOpen(false)}
                        className="recognition-dialog-button recognition-dialog-button--danger"
                    >
                        NO
                    </Button>
                    <Button
                        onClick={() => {
                            confirmCallback();
                            setConfirmOpen(false);
                        }}
                        className="recognition-dialog-button recognition-dialog-button--primary"
                    >
                        YES
                    </Button>
                </DialogActions>
            </Dialog>

            <main className="recognition-main">
                <section className="recognition-panel">
                    <h1 className="recognition-title">顔登録</h1>

                    <div className="recognition-preview-shell">
                        <video
                            ref={videoRef}
                            width="640"
                            height="480"
                            autoPlay
                            muted
                            playsInline
                            className="recognition-preview"
                        />
                    </div>

                    {!videoStarted ? (
                        <div className="recognition-single-action">
                            <button
                                type="button"
                                onClick={startVideo}
                                className="recognition-button recognition-button--start"
                            >
                                Start Video
                            </button>
                        </div>
                    ) : (
                        <div className="recognition-actions">
                            <button
                                type="button"
                                onClick={capture}
                                disabled={isRegistering}
                                className="recognition-button recognition-button--primary"
                            >
                                {registerBtnText}
                            </button>
                            <button
                                type="button"
                                onClick={verifyFace}
                                className="recognition-button recognition-button--verify"
                            >
                                顔認証
                            </button>
                        </div>
                    )}

                    <div className="recognition-fields">
                        <input
                            type="text"
                            value={employeeNumber}
                            onChange={handleEmployeeNumberChange}
                            placeholder="社員番号"
                            className="recognition-input"
                        />
                        <input
                            type="text"
                            value={employeeName}
                            onChange={(e) => setEmployeeName(e.target.value)}
                            placeholder="社員名"
                            className="recognition-input"
                        />
                    </div>

                    <div className="recognition-feedback" aria-live="polite">
                        <p className="recognition-message">{message}</p>
                        <p className="recognition-status">{status}</p>
                    </div>
                </section>
            </main>

            <ToastContainer theme={theme} />
        </div>
    );
};

export default Capture;
