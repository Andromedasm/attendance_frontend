import React, { useRef, useState } from 'react';
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

const Liveness: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // 用于区分按钮状态、提示用户移动头部等
    const [isVideoStarted, setIsVideoStarted] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [livenessBtnText, setLivenessBtnText] = useState('Start Video');
    const [livenessBtnClass, setLivenessBtnClass] = useState(
        'px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none'
    );

    // 弹窗
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');

    const showAlert = (msg: string) => {
        setAlertMessage(msg);
        setAlertOpen(true);
    };

    // 点击按钮逻辑
    const handleLivenessClick = () => {
        if (!isVideoStarted) {
            // 1) 先启动摄像头
            startVideo();
        } else {
            // 2) 摄像头已启动 => 进行活体检测
            performLivenessCheck();
        }
    };

    // 启动摄像头
    const startVideo = () => {
        navigator.mediaDevices
            .getUserMedia({ video: { width: 640, height: 480 } })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                    setIsVideoStarted(true);
                    setLivenessBtnText('Check Liveness');
                    setLivenessBtnClass(
                        'px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none'
                    );
                }
            })
            .catch((error) => {
                console.error('Error accessing the webcam', error);
                showAlert('Error accessing the webcam: ' + error.message);
            });
    };

    // 引导用户：先移动头部，然后捕捉帧
    const performLivenessCheck = () => {
        if (!videoRef.current || !canvasRef.current) {
            showAlert('Camera is not ready.');
            return;
        }

        setIsChecking(true);
        setLivenessBtnText('Checking...');
        setLivenessBtnClass(
            'px-6 py-3 bg-gray-400 text-white font-semibold text-xl rounded-lg shadow-md cursor-not-allowed'
        );

        showAlert('頭を左右上下に動かしてください。撮影します...');

        const frames: Blob[] = [];
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        let captureCount = 0;
        const maxFrames = 10;

        // 每 500ms 采集一帧，共采集 10 帧
        const intervalId = setInterval(() => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context?.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                if (blob) frames.push(blob);
                captureCount++;

                if (captureCount >= maxFrames) {
                    clearInterval(intervalId);
                    sendFrames(frames);
                }
            }, 'image/jpeg');
        }, 500);
    };

    // 将帧发送给后端
    const sendFrames = (frames: Blob[]) => {
        const formData = new FormData();
        frames.forEach((frame, i) => formData.append(`frame${i}`, frame));

        fetch('/api/liveness', {
            method: 'POST',
            body: formData
        })
            .then((res) => res.json())
            .then((data) => {
                // 后端返回 200 => { message: "Liveness confirmed" } 或 400 => { message: "No valid head movement..." }
                if (data.error) {
                    showAlert('エラー: ' + data.error);
                } else if (data.message) {
                    showAlert(data.message);
                } else {
                    showAlert('不明なエラーが発生しました');
                }
            })
            .catch((error) => {
                console.error('Error:', error);
                showAlert('Error sending frames: ' + error.message);
            })
            .finally(() => {
                resetLivenessButton();
            });
    };

    // 重置按钮
    const resetLivenessButton = () => {
        setIsChecking(false);
        setLivenessBtnText('Check Liveness');
        setLivenessBtnClass(
            'px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none'
        );
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10">
                {/* Alert Dialog */}
                <Dialog
                    open={alertOpen}
                    onClose={() => setAlertOpen(false)}
                    maxWidth="md"
                    fullWidth
                >
                    <DialogTitle style={{ fontSize: '1.5rem' }}>結果</DialogTitle>
                    <DialogContent>
                        <DialogContentText style={{ fontSize: '1.25rem' }}>
                            {alertMessage}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            onClick={() => setAlertOpen(false)}
                            style={{ backgroundColor: 'blue', color: 'white', fontSize: '1.25rem' }}
                        >
                            OK
                        </Button>
                    </DialogActions>
                </Dialog>

                <video
                    ref={videoRef}
                    width="640"
                    height="480"
                    className="rounded shadow-lg mb-4"
                    style={{ display: isVideoStarted ? 'block' : 'none' }}
                ></video>
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* 主按钮 */}
                <button
                    onClick={handleLivenessClick}
                    disabled={isChecking}
                    className={livenessBtnClass}
                >
                    {livenessBtnText}
                </button>
            </div>
        </div>
    );
};

export default Liveness;
