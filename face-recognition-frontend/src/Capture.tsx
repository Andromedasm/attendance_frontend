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

// 引入 react-toastify
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Capture: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);

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
    const [registerBtnClass, setRegisterBtnClass] = useState(
        'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75'
    );

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
        setRegisterBtnClass(
            'mt-4 px-6 py-3 bg-gray-400 text-white font-semibold text-xl rounded-lg shadow-md cursor-not-allowed'
        );
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
                                (match: any) =>
                                    `社員番号: ${match.employee_number}, 名前: ${match.employee_name}, 類似度: ${match.similarity.toFixed(
                                        2
                                    )}`
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
                        error.json().then((body: any) => {
                            showToastError(body.error);
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
        setRegisterBtnClass(
            'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75'
        );
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
                                (f: any) =>
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
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10">
                {/* 确认框 */}
                <Dialog
                    open={confirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    maxWidth="md"
                    fullWidth
                >
                    <DialogTitle style={{ fontSize: '1.5rem' }}>確認</DialogTitle>
                    <DialogContent>
                        <DialogContentText
                            dangerouslySetInnerHTML={{ __html: confirmMessage }}
                            style={{ fontSize: '1.25rem' }}
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

                {/* 视频预览 */}
                <video
                    ref={videoRef}
                    width="640"
                    height="480"
                    autoPlay
                    playsInline
                    className="rounded-lg shadow-lg mb-4"
                ></video>

                {/* 启动摄像头按钮 */}
                {!videoStarted && (
                    <button
                        onClick={startVideo}
                        className="mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                    >
                        Start Video
                    </button>
                )}

                {/* 如果视频已启动，显示 注册按钮 + 验证按钮 */}
                {videoStarted && (
                    <div className="flex space-x-4">
                        {/* 注册按钮 */}
                        <button
                            onClick={capture}
                            disabled={isRegistering}
                            className={registerBtnClass}
                        >
                            {registerBtnText}
                        </button>

                        {/* 验证人脸按钮: 渐变色 */}
                        <button
                            onClick={verifyFace}
                            className="mt-4 px-6 py-3 text-white font-semibold text-xl rounded-lg shadow-md
                                       bg-gradient-to-r from-purple-500 via-pink-500 to-red-500
                                       hover:from-purple-600 hover:via-pink-600 hover:to-red-600
                                       transition-all duration-300"
                        >
                            顔認証
                        </button>
                    </div>
                )}

                {/* 输入框: employeeNumber / employeeName */}
                <div className="mt-4 flex space-x-4">
                    <input
                        type="text"
                        value={employeeNumber}
                        onChange={handleEmployeeNumberChange}
                        placeholder="社員番号"
                        className="px-4 py-2 border text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                        type="text"
                        value={employeeName}
                        onChange={(e) => setEmployeeName(e.target.value)}
                        placeholder="社員名"
                        className="px-4 py-2 border text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* 显示提示 / 状态信息 */}
                <div className="mt-4 text-lg font-semibold text-green-500">{message}</div>
                <div className="mt-4 text-sm font-semibold text-gray-500">{status}</div>
            </div>

            {/* toast 容器 */}
            <ToastContainer />
        </div>
    );
};

export default Capture;
