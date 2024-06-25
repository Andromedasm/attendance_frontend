import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar'; // 引用 Sidebar 组件
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import './styles.scss';

const Capture: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [employeeNumber, setEmployeeNumber] = useState('');
    const [employeeName, setEmployeeName] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('');
    const [videoStarted, setVideoStarted] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [confirmMessage, setConfirmMessage] = useState('');
    const [confirmCallback, setConfirmCallback] = useState<() => void>(() => {});

    const showAlert = (msg: string) => {
        setAlertMessage(msg);
        setAlertOpen(true);
    };

    const showConfirm = (msg: string, callback: () => void) => {
        setConfirmMessage(msg);
        setConfirmCallback(() => callback);
        setConfirmOpen(true);
    };

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setVideoStarted(true);
                }
            })
            .catch(error => {
                console.error('Error accessing the media devices.', error);
                showAlert('Error starting video: ' + error.message);
            });
    };

    const capture = () => {
        if (!employeeNumber.trim() || !employeeName.trim()) {
            showAlert('社員番号と名前を記入してください.');
            return;
        }

        const canvas = document.createElement('canvas');
        const video = videoRef.current;
        if (video) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(blob => {
                const formData = new FormData();
                formData.append('image', blob as Blob, employeeNumber + '.png');
                formData.append('employeeNumber', employeeNumber);
                formData.append('employeeName', employeeName);

                setStatus('Uploading...');

                fetch('https://insightface.japaneast.cloudapp.azure.com/api/upload', {
                    method: 'POST',
                    body: formData,
                })
                    .then(response => {
                        if (!response.ok) {
                            throw response;
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data.similar) {
                            let matchesInfo = data.matches.map((match: any) =>
                                `社員番号: ${match.employee_number}, 名前: ${match.employee_name}, 類似度: ${match.similarity.toFixed(2)}`
                            ).join("\n");
                            showConfirm(`類似な顔が存在します:\n${matchesInfo}\nアップロードしますか?`, () => {
                                formData.append('override', 'true');
                                fetch('https://insightface.japaneast.cloudapp.azure.com/api/upload', {
                                    method: 'POST',
                                    body: formData,
                                })
                                    .then(response => response.json())
                                    .then(data => showAlert(data.message))
                                    .catch(error => showAlert('アップロードに失敗しました: ' + error.message));
                            });
                        } else {
                            showAlert(data.message);
                        }
                    })
                    .catch(error => {
                        if (error.json) {
                            error.json().then((body: any) => {
                                showAlert(body.error);
                            });
                        } else {
                            console.error('Error uploading the image.', error);
                            showAlert(error.message);
                        }
                        setStatus('');
                    });
            });
        }
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar /> {/* 使用 Sidebar 组件 */}
            <div className="flex-1 p-10 ml-64">
                <div className="flex flex-col items-center justify-center min-h-full relative">
                    <Dialog open={alertOpen} onClose={() => setAlertOpen(false)}>
                        <DialogTitle>メッセージ</DialogTitle>
                        <DialogContent>
                            <DialogContentText>{alertMessage}</DialogContentText>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setAlertOpen(false)} style={{ backgroundColor: 'blue', color: 'white' }}>OK</Button>
                        </DialogActions>
                    </Dialog>

                    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                        <DialogTitle>Confirm</DialogTitle>
                        <DialogContent>
                            <DialogContentText>{confirmMessage}</DialogContentText>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setConfirmOpen(false)} style={{ backgroundColor: 'red', color: 'white' }}>NO</Button>
                            <Button onClick={() => { confirmCallback(); setConfirmOpen(false); }} style={{ backgroundColor: 'blue', color: 'white' }}>YES</Button>
                        </DialogActions>
                    </Dialog>

                    <video ref={videoRef} width="640" height="480" autoPlay playsInline className="rounded-lg shadow-lg mb-4"></video> {/* 固定视频尺寸 */}
                    {!videoStarted && (
                        <button
                            onClick={startVideo}
                            className="mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                        >
                            Start Video
                        </button>
                    )}
                    {videoStarted && (
                        <button
                            onClick={capture}
                            className="mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
                        >
                            Capture
                        </button>
                    )}
                    <div className="mt-4 flex space-x-4">
                        <input
                            type="text"
                            value={employeeNumber}
                            onChange={(e) => setEmployeeNumber(e.target.value)}
                            placeholder="Employee Number"
                            className="px-4 py-2 border text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="text"
                            value={employeeName}
                            onChange={(e) => setEmployeeName(e.target.value)}
                            placeholder="Employee Name"
                            className="px-4 py-2 border text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-green-500">{message}</div>
                    <div className="mt-4 text-sm font-semibold text-gray-500">{status}</div>
                </div>
            </div>
        </div>
    );
};

export default Capture;
