import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar'; // 引用 Sidebar 组件
import './styles.scss';

const ReRegister: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [employeeNumber, setEmployeeNumber] = useState('');
    const [employeeName, setEmployeeName] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('');
    // 移除未使用的 videoStarted 状态
    // const [videoStarted, setVideoStarted] = useState(false);

    const showMessage = (msg: string, timeout = 5000) => {
        setMessage(msg);
        setTimeout(() => {
            setMessage('');
        }, timeout);
    };

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 } // 调整视频尺寸
        })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // setVideoStarted(true); // 移除未使用的状态更新
                    document.getElementById('startVideo')!.style.display = 'none';
                    document.getElementById('reRegister')!.style.display = 'inline-block';
                }
            })
            .catch(error => {
                console.error('Error accessing the media devices.', error);
                showMessage('Error starting video: ' + error.message);
            });
    };

    const reRegister = () => {
        if (!employeeNumber.trim() || !employeeName.trim()) {
            alert('社員番号と名前を記入してください.');
            return;
        }

        const canvas = document.createElement('canvas');
        const video = videoRef.current;
        if (video) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(blob => {
                let formData = new FormData();
                formData.append('image', blob as Blob, employeeNumber + '.png');
                formData.append('employeeNumber', employeeNumber);
                formData.append('employeeName', employeeName);

                setStatus('Uploading...');

                fetch('https://insightface.japaneast.cloudapp.azure.com/api/re_register', {
                    method: 'POST',
                    body: formData,
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.override_needed) {
                            if (confirm('社員番号既に存在します。上書きしますか？')) {
                                let formDataOverride = new FormData();
                                formDataOverride.append('image', blob as Blob, employeeNumber + '.png');
                                formDataOverride.append('employeeNumber', employeeNumber);
                                formDataOverride.append('employeeName', employeeName);
                                formDataOverride.append('override', 'true');

                                fetch('https://insightface.japaneast.cloudapp.azure.com/api/re_register', {
                                    method: 'POST',
                                    body: formDataOverride,
                                })
                                    .then(response => response.json())
                                    .then(data => {
                                        alert(data.message);
                                        setStatus('');
                                    })
                                    .catch(error => {
                                        console.error('Error:', error);
                                        alert('An error occurred: ' + error.message);
                                        setStatus('');
                                    });
                            } else {
                                alert('操作已取消');
                                setStatus('');
                            }
                        } else {
                            alert(data.message);
                            setStatus('');
                        }
                    })
                    .catch(error => {
                        console.error('Error uploading:', error);
                        alert('Error: ' + error.message);
                        setStatus('');
                    });
            });
        }
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar /> {/* 使用 Sidebar 组件 */}
            <div className="flex-1 p-10 ml-64">
                <h2 className="text-3xl font-bold mb-6">顔データ再登録</h2>
                <div className="flex flex-col items-center justify-center min-h-full">
                    <video ref={videoRef} width="640" height="480" autoPlay playsInline
                           className="rounded-lg shadow-lg mb-4"></video>
                    <button
                        id="startVideo"
                        onClick={startVideo}
                        className="mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                    >
                        Start Video
                    </button>
                    <button
                        id="reRegister"
                        onClick={reRegister}
                        className="mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
                        style={{ display: 'none' }}
                    >
                        Re-Register
                    </button>
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

export default ReRegister;
