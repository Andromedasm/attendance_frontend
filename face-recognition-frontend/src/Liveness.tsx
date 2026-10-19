import React, { useEffect, useRef, useState } from 'react';
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<number | null>(null);
  const captureSessionRef = useRef(0);
  const isMountedRef = useRef(true);
  const isStartingVideoRef = useRef(false);
  const isCheckingRef = useRef(false);
  const { theme } = useTheme();

  const [isVideoStarted, setIsVideoStarted] = useState(false);
  const [isStartingVideo, setIsStartingVideo] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isStartingVideoRef.current = false;
      isCheckingRef.current = false;
      captureSessionRef.current += 1;
      if (captureIntervalRef.current !== null) {
        window.clearInterval(captureIntervalRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const showAlert = (msg: string) => {
    setAlertMessage(msg);
    setAlertOpen(true);
  };

  const startVideo = () => {
    if (isStartingVideoRef.current || isVideoStarted) return;

    isStartingVideoRef.current = true;
    setIsStartingVideo(true);

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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
        setIsVideoStarted(true);
      })
      .catch((error) => {
        if (!isMountedRef.current) return;
        console.error('Error accessing the webcam', error);
        showAlert('カメラを開始できません: ' + error.message);
      })
      .finally(() => {
        isStartingVideoRef.current = false;
        if (isMountedRef.current) setIsStartingVideo(false);
      });
  };

  const stopVideo = () => {
    captureSessionRef.current += 1;
    isCheckingRef.current = false;

    if (captureIntervalRef.current !== null) {
      window.clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    setIsVideoStarted(false);
    setIsChecking(false);
  };

  const finishLivenessCheck = (sessionId: number) => {
    if (captureSessionRef.current !== sessionId) return;

    isCheckingRef.current = false;
    if (isMountedRef.current) setIsChecking(false);
  };

  const sendFrames = (frames: Blob[], sessionId: number) => {
    if (captureSessionRef.current !== sessionId) return;

    const formData = new FormData();
    frames.forEach((frame, index) => formData.append(`frame${index}`, frame));

    fetch('/api/liveness', { method: 'POST', body: formData })
      .then((response) => response.json())
      .then((data) => {
        if (!isMountedRef.current || captureSessionRef.current !== sessionId) return;

        if (data.error) showAlert('エラー: ' + data.error);
        else if (data.message) showAlert(data.message);
        else showAlert('不明なエラーが発生しました');
      })
      .catch((error) => {
        if (!isMountedRef.current || captureSessionRef.current !== sessionId) return;
        console.error('Error:', error);
        showAlert('送信エラー: ' + error.message);
      })
      .finally(() => finishLivenessCheck(sessionId));
  };

  const performLivenessCheck = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.srcObject) {
      showAlert('カメラを起動してください');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      showAlert('カメラの準備が完了していません');
      return;
    }
    if (isCheckingRef.current) return;

    const context = canvas.getContext('2d');
    if (!context) {
      showAlert('Camera is not ready.');
      return;
    }

    isCheckingRef.current = true;
    setIsChecking(true);
    showAlert('頭を左右上下に動かしてください。撮影します...');

    const maxFrames = 10;
    const sessionId = captureSessionRef.current + 1;
    captureSessionRef.current = sessionId;
    const encodedFrames: Array<Blob | null> = Array(maxFrames).fill(null);
    let scheduledCount = 0;
    let completedCount = 0;

    const intervalId = window.setInterval(() => {
      if (captureSessionRef.current !== sessionId) {
        window.clearInterval(intervalId);
        return;
      }

      const frameIndex = scheduledCount;
      scheduledCount += 1;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (captureSessionRef.current !== sessionId) return;

          encodedFrames[frameIndex] = blob;
          completedCount += 1;

          if (completedCount === maxFrames) {
            const frames = encodedFrames.filter((frame): frame is Blob => frame !== null);
            if (frames.length === 0) {
              if (isMountedRef.current) showAlert('画像を取得できませんでした');
              finishLivenessCheck(sessionId);
              return;
            }
            sendFrames(frames, sessionId);
          }
        },
        'image/jpeg',
        0.85
      );

      if (scheduledCount >= maxFrames) {
        window.clearInterval(intervalId);
        if (captureIntervalRef.current === intervalId) captureIntervalRef.current = null;
      }
    }, 500);

    captureIntervalRef.current = intervalId;
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
                disabled={isChecking}
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
