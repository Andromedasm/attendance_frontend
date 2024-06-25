import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar'; // 引用 Sidebar 组件
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

const Liveness: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isVideoStarted, setIsVideoStarted] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');

    const showAlert = (msg: string) => {
        setAlertMessage(msg);
        setAlertOpen(true);
    };

    const startVideo = () => {
        if (!isVideoStarted) {
            navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }) // 调整视频尺寸
                .then(stream => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.style.display = 'block';
                        videoRef.current.play();
                        setIsVideoStarted(true);
                    }
                })
                .catch(error => {
                    console.error("Error accessing the webcam", error);
                    showAlert('Error accessing the webcam: ' + error.message);
                });
        } else {
            performLivenessCheck();
        }
    };

    const performLivenessCheck = () => {
        const frames: Blob[] = [];
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas) {
            const context = canvas.getContext('2d');
            let captureInterval = setInterval(() => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context?.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                    if (blob) {
                        frames.push(blob);
                        if (frames.length === 5) {
                            clearInterval(captureInterval);
                            sendFrames(frames);
                        }
                    }
                }, 'image/jpeg');
            }, 200);
        }
    };

    const sendFrames = (frames: Blob[]) => {
        const formData = new FormData();
        frames.forEach((frame, index) => formData.append(`frame${index}`, frame));
        fetch('https://insightface.japaneast.cloudapp.azure.com/api/liveness', {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                showAlert(data.message);
            })
            .catch(error => {
                showAlert('Error sending frames: ' + error.message);
                console.error('Error:', error);
            });
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar /> {/* 使用 Sidebar 组件 */}
            <div className="flex-1 flex flex-col items-center justify-center ml-64">
                <Dialog open={alertOpen} onClose={() => setAlertOpen(false)}>
                    <DialogTitle>確認結果</DialogTitle>
                    <DialogContent>
                        <DialogContentText>{alertMessage}</DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setAlertOpen(false)} style={{ backgroundColor: 'blue', color: 'white' }}>OK</Button>
                    </DialogActions>
                </Dialog>

                <video ref={videoRef} width="640" height="480" className="rounded shadow-lg mb-4"></video>
                <button
                    onClick={startVideo}
                    className="px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                >
                    {isVideoStarted ? 'Check' : 'Start Video'}
                </button>
                <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
            </div>
        </div>
    );
};

export default Liveness;
