import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import ThemeBackdrop from './ThemeBackdrop';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './theme-context';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';
import './recognition.scss';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Verify: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { theme } = useTheme();

  const [videoStarted, setVideoStarted] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyText, setVerifyText] = useState('認証');

  const showError = (msg: string) => toast.error(msg, { autoClose: 5000 });
  const showInfo = (msg: string) =>
    toast.info(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });
  const showSuccess = (msg: string) =>
    toast.success(<div dangerouslySetInnerHTML={{ __html: msg }} />, { autoClose: 5000 });

  const startVideo = () => {
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then(async (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {}
          setVideoStarted(true);
        }
      })
      .catch((error) => {
        console.error(error);
        showError('ビデオを開始できません: ' + error.message);
      });
  };

  const stopVideo = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setVideoStarted(false);
  };

  const verify = () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) {
      showError('カメラを起動してください');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showError('画像を取得できませんでした');
          return;
        }

        setIsVerifying(true);
        setVerifyText('認証中...');

        const formData = new FormData();
        formData.append('image', blob);

        fetch('/api/verify', { method: 'POST', body: formData })
          .then((response) => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
          })
          .then((data) => {
            if (data.error) {
              showError('認証失敗しました: ' + data.error);
            } else if (data.found_faces && data.found_faces.length > 0) {
              const info = data.found_faces
                .map((f: any) => {
                  const similarity = f.similarity ? f.similarity.toFixed(2) : 'N/A';
                  return `社員番号: ${f.employee_number}, 名前: ${f.employee_name}, 類似度: ${similarity}`;
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
            console.error(error);
            showError('認証失敗しました: ' + error.message);
          })
          .finally(() => {
            setIsVerifying(false);
            setVerifyText('認証');
          });
      },
      'image/jpeg',
      0.9
    );
  };

  const canVerify = videoStarted && !isVerifying;

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
