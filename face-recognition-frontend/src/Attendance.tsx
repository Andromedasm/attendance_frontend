import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar'; // 引用 Sidebar 组件
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';

const Attendance: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<number>(0);
    const [buttonText, setButtonText] = useState<string>('Start Video');
    const [buttonClass, setButtonClass] = useState<string>('mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75');

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setButtonText('Take Attendance');
                setButtonClass('mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75');
            })
            .catch(error => {
                console.error("Something went wrong!", error);
            });
    };

    const startAttendance = () => {
        if (selectedStatus === 0) {
            alert('请选择考勤类型');
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
                formData.append('image', blob as Blob);
                formData.append('status', selectedStatus.toString());

                fetch('https://insightface.japaneast.cloudapp.azure.com/api/record_attendance', {
                    method: 'POST',
                    body: formData
                }).then(response => response.json())
                    .then(data => {
                        if (data.message) {
                            alert(data.message);
                        } else {
                            alert('Error: ' + data.error);
                        }
                    })
                    .catch(error => console.error('Error:', error));
            });
        }
    };

    const handleStatusClick = (status: number) => {
        setSelectedStatus(status);
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar /> {/* 使用 Sidebar 组件 */}
            <div className="flex-1 flex flex-col items-center justify-center p-10 ml-64">
                <div className="flex flex-col items-center justify-center h-full">
                    <video ref={videoRef} width="640" height="480" className="rounded-lg shadow-lg mb-4" autoPlay playsInline></video>
                    <div className="flex mb-4 space-x-4">
                        <button
                            className={`text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-cyan-300 dark:focus:ring-cyan-800 font-medium rounded-lg text-2xl px-24 py-10 text-center ${selectedStatus === 1 ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStatusClick(1);
                            }}
                        >
                            出勤
                        </button>
                        <button
                            className={`text-white bg-gradient-to-br from-pink-500 to-orange-400 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-pink-200 dark:focus:ring-pink-800 font-medium rounded-lg text-2xl px-24 py-10 text-center ${selectedStatus === 2 ? 'selected' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStatusClick(2);
                            }}
                        >
                            退勤
                        </button>
                    </div>
                    <button
                        onClick={buttonText === 'Start Video' ? startVideo : startAttendance}
                        className={buttonClass}
                    >
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Attendance;
