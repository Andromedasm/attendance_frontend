import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

// 1. 引入 react-toastify
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Verify: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // 去掉了原先的弹窗控制
    // const [alertOpen, setAlertOpen] = useState(false);
    // const [alertMessage, setAlertMessage] = useState('');

    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyText, setVerifyText] = useState('認証開始');

    // 用toast替代原先的showAlert
    const showError = (msg: string) => {
        toast.error(msg, { autoClose: 5000 });
    };

    const showInfo = (msg: string) => {
        toast.info(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });
    };

    const showSuccess = (msg: string) => {
        toast.success(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });
    };

    const startVideo = () => {
        navigator.mediaDevices
            .getUserMedia({
                video: { width: 640, height: 480 },
            })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                // 隐藏 "Start Video"，显示 "認証開始" 按钮
                const startVideoBtn = document.getElementById('startVideo');
                const verifyBtn = document.getElementById('verify');
                if (startVideoBtn) startVideoBtn.style.display = 'none';
                if (verifyBtn) verifyBtn.style.display = 'inline-block';
            })
            .catch((error) => {
                console.error(error);
                showError('ビデオを開始できません: ' + error.message);
            });
    };

    const verify = () => {
        const video = videoRef.current;
        if (!video) return;

        // 创建canvas并抓取当前视频帧
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) {
                showError('画像を取得できませんでした');
                return;
            }

            setIsVerifying(true);
            setVerifyText('認証中...');

            const formData = new FormData();
            formData.append('image', blob);

            fetch('/api/verify', {
                method: 'POST',
                body: formData,
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then((data) => {
                    // 后端可能返回:
                    // 1) { "found_faces": [{employee_number, employee_name, similarity}, ... ] }
                    // 2) { "message": "..." }
                    // 3) { "error": "..." }
                    if (data.error) {
                        // 失败: 显示错误
                        showError('認証失敗しました: ' + data.error);
                    } else if (data.found_faces && data.found_faces.length > 0) {
                        // 多个人员同时匹配
                        const info = data.found_faces
                            .map((f: any) => {
                                const similarity = f.similarity ? f.similarity.toFixed(2) : 'N/A';
                                return `社員番号: ${f.employee_number}, 名前: ${f.employee_name}, 類似度: ${similarity}`;
                            })
                            .join('<br/>');
                        // 成功识别：显示成功提示
                        showSuccess(`以下の顔が認証されました:<br/>${info}`);
                    } else if (data.message) {
                        // data.message 可能是成功或提示
                        showInfo(data.message);
                    } else {
                        // 未知的返回
                        showInfo('認証結果を取得できませんでした。');
                    }
                })
                .catch((error) => {
                    console.error(error);
                    showError('認証失敗しました: ' + error.message);
                })
                .finally(() => {
                    setIsVerifying(false);
                    setVerifyText('認証開始');
                });
        });
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10">

                <video
                    ref={videoRef}
                    width="640"
                    height="480"
                    autoPlay
                    playsInline
                    className="rounded-lg shadow-lg mb-4"
                ></video>

                {/* "Start Video" 按钮 */}
                <button
                    id="startVideo"
                    onClick={startVideo}
                    className="mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                >
                    Start Video
                </button>

                {/* "認証開始" 按钮 (初始隐藏) */}
                <button
                    id="verify"
                    onClick={verify}
                    disabled={isVerifying}
                    className={
                        "mt-4 px-6 py-3 text-white font-semibold text-xl rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 " +
                        (isVerifying
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-blue-500 hover:bg-blue-700 focus:ring-blue-500")
                    }
                    style={{ display: 'none' }}
                >
                    {verifyText}
                </button>
            </div>

            {/* 4. 在页面底部添加 ToastContainer */}
            <ToastContainer />
        </div>
    );
};

export default Verify;
