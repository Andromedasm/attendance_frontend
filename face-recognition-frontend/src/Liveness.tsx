import React, { useRef, useState } from 'react';
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
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';
import './recognition.scss';

const Liveness: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isVideoStarted, setIsVideoStarted] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (msg: string) => {
    setAlertMessage(msg);
    setAlertOpen(true);
  };

  const startVideo = () => {
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      .then(async (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {}
        }
        setIsVideoStarted(true);
      })
      .catch((error) => {
        console.error('Error accessing the webcam', error);
        showAlert('カメラを開始できません: ' + error.message);
      });
  };

  const stopVideo = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setIsVideoStarted(false);
  };

  const performLivenessCheck = () => {
    if (!videoRef.current || !canvasRef.current) {
      showAlert('Camera is not ready.');
      return;
    }
    if (!videoRef.current.srcObject) {
      showAlert('カメラを起動してください');
      return;
    }

    setIsChecking(true);

    // 这里保留你原来的提示逻辑
    showAlert('頭を左右上下に動かしてください。撮影します...');

    const frames: Blob[] = [];
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    let captureCount = 0;
    const maxFrames = 10;

    const intervalId = setInterval(() => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) frames.push(blob);
          captureCount++;

          if (captureCount >= maxFrames) {
            clearInterval(intervalId);
            sendFrames(frames);
          }
        },
        'image/jpeg',
        0.85
      );
    }, 500);
  };

  const sendFrames = (frames: Blob[]) => {
    const formData = new FormData();
    frames.forEach((frame, i) => formData.append(`frame${i}`, frame));

    fetch('/api/liveness', { method: 'POST', body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) showAlert('エラー: ' + data.error);
        else if (data.message) showAlert(data.message);
        else showAlert('不明なエラーが発生しました');
      })
      .catch((error) => {
        console.error('Error:', error);
        showAlert('送信エラー: ' + error.message);
      })
      .finally(() => {
        setIsChecking(false);
      });
  };

  return (
    <div className="theme-surface recognition-surface" data-theme={theme}>
      <Sidebar />
      <ThemeToggle />
      <ThemeBackdrop />

      <Dialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { className: 'recognition-dialog' } }}
      >
        <DialogTitle>{isChecking ? 'ライブネスチェック' : '結果'}</DialogTitle>
        <DialogContent>
          <DialogContentText>{alertMessage}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAlertOpen(false)}
            className="recognition-dialog-button recognition-dialog-button--primary"
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <main className="recognition-main">
        <section className="recognition-panel">
          <h1 className="recognition-title">ライブネスチェック</h1>

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

          {!isVideoStarted ? (
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
                onClick={performLivenessCheck}
                disabled={isChecking}
                className="recognition-button recognition-button--verify"
              >
                {isChecking ? 'Checking...' : 'Check'}
              </button>
            </div>
          )}

          <div className="recognition-feedback" aria-live="polite">
            <p className="recognition-status">
              {isVideoStarted
                ? isChecking
                  ? '処理中...'
                  : '顔を中央に。開始後は頭を左右上下に動かしてください。'
                : ''}
            </p>
          </div>
        </section>
      </main>

      <canvas ref={canvasRef} className="recognition-capture-canvas" />
    </div>
  );
};

export default Liveness;
