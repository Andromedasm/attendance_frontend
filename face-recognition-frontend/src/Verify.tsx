import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import ThemeBackdrop from './ThemeBackdrop';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './theme-context';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';
import './recognition.scss';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface FaceMatch {
  employee_number: string | number;
  employee_name: string;
  similarity?: number;
}

const Verify: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const isStartingVideoRef = useRef(false);
  const verifyInFlightRef = useRef(false);
  const { theme } = useTheme();

  const [videoStarted, setVideoStarted] = useState(false);
  const [isStartingVideo, setIsStartingVideo] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyText, setVerifyText] = useState('認証');

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isStartingVideoRef.current = false;
      verifyInFlightRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const showError = (msg: string) => toast.error(msg, { autoClose: 5000 });
  const showInfo = (msg: string) =>
    toast.info(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });
  const showSuccess = (msg: string) =>
    toast.success(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });

  const startVideo = () => {
    if (isStartingVideoRef.current || videoStarted) return;

    isStartingVideoRef.current = true;
    setIsStartingVideo(true);

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } },
        audio: false,
      })
      .then(async (stream) => {
        streamRef.current = stream;

        if (!isMountedRef.current || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (error) {
          console.warn('Video playback will continue through autoplay when available:', error);
        }
        setVideoStarted(true);
      })
      .catch((error) => {
        if (!isMountedRef.current) return;
        console.error(error);
        showError('ビデオを開始できません: ' + error.message);
      })
      .finally(() => {
        isStartingVideoRef.current = false;
        if (isMountedRef.current) setIsStartingVideo(false);
      });
  };

  const stopVideo = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    setVideoStarted(false);
  };

  const finishVerification = () => {
    verifyInFlightRef.current = false;

    if (isMountedRef.current) {
      setIsVerifying(false);
      setVerifyText('認証');
    }
  };

  const verify = () => {
    if (verifyInFlightRef.current) return;

    const video = videoRef.current;
    if (!video || !video.srcObject) {
      showError('カメラを起動してください');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      showError('カメラの準備が完了していません');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      showError('画像を取得できませんでした');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    verifyInFlightRef.current = true;
    setIsVerifying(true);
    setVerifyText('認証中...');

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          if (isMountedRef.current) showError('画像を取得できませんでした');
          finishVerification();
          return;
        }
        if (!isMountedRef.current) {
          finishVerification();
          return;
        }

        const formData = new FormData();
        formData.append('image', blob);

        fetch('/api/verify', { method: 'POST', body: formData })
          .then((response) => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
          })
          .then((data) => {
            if (!isMountedRef.current) return;

            if (data.error) {
              showError('認証失敗しました: ' + data.error);
            } else if (data.found_faces && data.found_faces.length > 0) {
              const info = data.found_faces
                .map((face: FaceMatch) => {
                  const similarity = face.similarity ? face.similarity.toFixed(2) : 'N/A';
                  return `社員番号: ${face.employee_number}, 名前: ${face.employee_name}, 類似度: ${similarity}`;
                })
                .join('<br/>');
              showSuccess(`以下の顔が認証されました:<br/>${info}`);
            } else if (data.message) {
              showInfo(data.message);
            } else {
              showInfo('認証結果を取得できませんでした。');
            }
          })
          .catch((error) => {
            if (!isMountedRef.current) return;
            console.error(error);
            showError('認証失敗しました: ' + error.message);
          })
          .finally(finishVerification);
      },
      'image/jpeg',
      0.9
    );
  };

  const canVerify = videoStarted && !isVerifying && !isStartingVideo;

  return (
    <div className="theme-surface recognition-surface" data-theme={theme}>
      <Sidebar />
      <ThemeToggle />
      <ThemeBackdrop />

      <main className="recognition-main">
        <section className="recognition-panel">
          <h1 className="recognition-title">顔認証</h1>

          <div className="recognition-preview-shell recognition-preview-shell--wide">
            <video
              ref={videoRef}
              width="1280"
              height="720"
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
                disabled={isStartingVideo}
                aria-busy={isStartingVideo}
                className="recognition-button recognition-button--start"
              >
                Start Camera
              </button>
            </div>
          ) : (
            <div className="recognition-actions">
              <button
                type="button"
                onClick={stopVideo}
                className="recognition-button recognition-button--neutral"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={verify}
                disabled={!canVerify}
                className="recognition-button recognition-button--verify"
              >
                {verifyText}
              </button>
            </div>
          )}
        </section>
      </main>

      <ToastContainer theme={theme} />
    </div>
  );
};

export default Verify;
