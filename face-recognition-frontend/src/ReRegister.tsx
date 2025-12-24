import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import './styles.scss';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const HEADER_H = 84;

const ReRegister: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [employeeNumber, setEmployeeNumber] = useState('');
  const [employeeName, setEmployeeName] = useState('');

  // status：用于“取得した社員名/見つかりません/アップロード中...”
  const [status, setStatus] = useState('');
  const [videoStarted, setVideoStarted] = useState(false);

  const [isReRegistering, setIsReRegistering] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState('');
  const [dialogMode, setDialogMode] = useState<
    'confirm' | 'lowSimilarityRequest' | 'lowSimilarityConfirm' | ''
  >('');
  const [currentSimilarityScore, setCurrentSimilarityScore] = useState<number | null>(null);

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [lastAuthTime, setLastAuthTime] = useState<number | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyText, setVerifyText] = useState('認証');

  const showToastError = (msg: string) => toast.error(msg, { autoClose: 5000 });
  const showToastInfo = (msg: string) => toast.info(msg, { autoClose: 5000 });
  const showToastInfoHTML = (htmlStr: string) =>
    toast.info(<div dangerouslySetInnerHTML={{ __html: htmlStr }} />, { autoClose: 5000 });
  const showToastSuccessHTML = (htmlStr: string) =>
    toast.success(<div dangerouslySetInnerHTML={{ __html: htmlStr }} />, { autoClose: 5000 });

  const handleEmployeeNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const number = e.target.value;
    setEmployeeNumber(number);

    if (number.trim() !== '') {
      fetch(`/api/get_employee_name?employeeNumber=${encodeURIComponent(number.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.employeeName) {
            setEmployeeName(data.employeeName);
            setStatus(`取得した社員名: ${data.employeeName}`);
          } else {
            setEmployeeName('');
            setStatus('該当社員が見つかりません');
          }
        })
        .catch((error) => {
          console.error('Error fetching employee name:', error);
          setStatus('社員名を取得できませんでした');
        });
    } else {
      setEmployeeName('');
      setStatus('');
    }
  };

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
        console.error('Error accessing media devices.', error);
        showToastError('ビデオを開始できません: ' + error.message);
      });
  };

  const stopVideo = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setVideoStarted(false);
  };

  const closePasswordDialog = () => {
    setPasswordDialogOpen(false);
    setAdminPassword('');
  };

  const handlePasswordSubmit = () => {
    if (!adminPassword.trim()) {
      showToastError('パスワードを入力してください');
      return;
    }

    const formData = new FormData();
    formData.append('password', adminPassword);

    fetch('/api/check_admin_password', { method: 'POST', body: formData })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.detail || '認証失敗');
        }
        return res.json();
      })
      .then(() => {
        setLastAuthTime(Date.now());
        closePasswordDialog();
        showToastInfo('パスワード認証成功');
        reRegister();
      })
      .catch((err) => {
        showToastError('パスワードが違います: ' + err.message);
      });
  };

  const resetReRegisterState = () => {
    setIsReRegistering(false);
    // status 保留
  };

  const reRegister = (forceOverrideLowSimilarity = false, isLegacyOverride = false) => {
    if (!employeeNumber.trim() || !employeeName.trim()) {
      showToastError('社員番号と名前を記入してください');
      return;
    }
    if (!videoRef.current) {
      showToastError('ビデオが準備できていません');
      return;
    }

    setIsReRegistering(true);
    setStatus('アップロード中...');

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        showToastError('画像を取得できませんでした');
        resetReRegisterState();
        return;
      }

      const formData = new FormData();
      formData.append('image', blob, employeeNumber + '.png');
      formData.append('employeeNumber', employeeNumber);
      formData.append('employeeName', employeeName);

      if (forceOverrideLowSimilarity) formData.append('force_override_low_similarity', 'true');
      if (isLegacyOverride) formData.append('override', 'true');

      fetch('/api/re_register', { method: 'POST', body: formData })
        .then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ detail: 'サーバーエラー' }));
            throw new Error(errorData.detail || errorData.error || `HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          // 仍然把后端 message 写到 status（但显示位置在输入框下方）
          setStatus(data.message || '');

          if (data.error) {
            showToastError(data.error);
            return;
          }

          if (data.similarity_check === true) {
            showToastSuccessHTML(data.message || '再登録が完了しました');
            return;
          }

          if (data.similarity_check === false && data.similarity_score !== undefined) {
            setCurrentSimilarityScore(data.similarity_score);
            setDialogContent(
              data.message ||
                `類似度 ${Number(data.similarity_score).toFixed(2)} が低いです。続行しますか？`
            );
            setDialogMode('lowSimilarityConfirm');
            setDialogOpen(true);
            return;
          }

          if (data.override_needed) {
            setDialogContent(data.message || '上書きしますか？');
            setDialogMode('confirm');
            setDialogOpen(true);
            return;
          }

          showToastInfoHTML(data.message || '再登録処理が完了しました。');
        })
        .catch((error) => {
          console.error('Error re_register:', error);
          setStatus('');
          showToastError('再登録エラー: ' + error.message);
        })
        .finally(() => resetReRegisterState());
    }, 'image/jpeg', 0.9);
  };

  const checkPasswordAndReRegister = () => {
    if (lastAuthTime && Date.now() - lastAuthTime < 15 * 60 * 1000) {
      reRegister();
    } else {
      setPasswordDialogOpen(true);
    }
  };

  const handleYesLegacy = () => {
    setDialogOpen(false);
    reRegister(false, true);
  };
  const handleNo = () => {
    setDialogOpen(false);
    showToastInfo('キャンセルしました');
  };

  const handleForceProceedLowSimilarity = () => {
    setDialogOpen(false);
    reRegister(true, false);
  };
  const handleCancelLowSimilarity = () => {
    setDialogOpen(false);
    showToastInfo('キャンセルしました');
  };

  const verifyFace = () => {
    if (!videoRef.current) {
      showToastError('ビデオが準備できていません');
      return;
    }

    setIsVerifying(true);
    setVerifyText('認証中...');

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        showToastError('画像を取得できませんでした');
        setIsVerifying(false);
        setVerifyText('認証');
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
          if (data.error) {
            showToastError('認証失敗しました: ' + data.error);
          } else if (data.found_faces && data.found_faces.length > 0) {
            const info = data.found_faces
              .map((f: any) => {
                const similarity = f.similarity ? f.similarity.toFixed(2) : 'N/A';
                return `社員番号: ${f.employee_number}, 名前: ${f.employee_name}, 類似度: ${similarity}`;
              })
              .join('<br/>');
            showToastSuccessHTML(`以下の顔が認証されました:<br/>${info}`);
          } else if (data.message) {
            showToastInfoHTML(data.message);
          } else {
            showToastInfo('認証結果を取得できませんでした');
          }
        })
        .catch((err) => {
          console.error(err);
          showToastError('認証失敗しました: ' + err.message);
        })
        .finally(() => {
          setIsVerifying(false);
          setVerifyText('認証');
        });
    }, 'image/jpeg', 0.9);
  };

  const canOperate = videoStarted;
  const canReRegister = canOperate && !isReRegistering;
  const canVerify = canOperate && !isVerifying;

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />

        <div className="flex-1 overflow-hidden">
          {/* header：与 Capture 一致：OFF 仅显示；ON 变成可点 Stop */}
          <header className="border-b border-black/5 bg-white/80 backdrop-blur" style={{ height: HEADER_H }}>
            <div className="flex h-full items-center justify-between px-6">
              <div className="w-16 shrink-0" aria-hidden="true" />
              <div className="flex items-center gap-3">
                {!videoStarted ? (
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
                    OFF
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={stopVideo}
                    className="h-11 rounded-full bg-slate-900 px-5 text-sm font-extrabold text-white shadow-sm
                               hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                    aria-label="Stop camera"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="overflow-auto px-6 py-6" style={{ height: `calc(100dvh - ${HEADER_H}px)` }}>
            <div className="grid grid-cols-[2.35fr_1fr] gap-6">
              {/* 左：视频遮罩（与 Capture 一致的文案 + Start Camara） */}
              <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="relative overflow-hidden rounded-[24px] bg-black ring-1 ring-black/10">
                  <div className="aspect-video w-full">
                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  </div>

                  {!videoStarted && (
                    <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm p-8">
                      <div className="text-center">
                        <p className="text-lg font-extrabold text-slate-900">
                          下のボタンを押してカメラを起動してください
                        </p>

                        <button
                          onClick={startVideo}
                          className="mt-5 h-16 rounded-3xl bg-slate-900 px-10 text-2xl font-extrabold text-white shadow
                                     focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                        >
                          Start Camara
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 右：输入框 + 状态提示在输入框下方（同 Capture 颜色/样式） */}
              <aside className="flex flex-col gap-6">
                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="space-y-5">
                    <div>
                      <input
                        type="text"
                        value={employeeNumber}
                        onChange={handleEmployeeNumberChange}
                        placeholder="社員番号"
                        className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg text-slate-900
                                   placeholder:text-slate-400 shadow-sm outline-none
                                   focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                      />

                      {/* ✅ 状态信息移到输入框下方，且用同样样式 */}
                      {status && (
                        <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200/60">
                          <p className="text-base font-semibold text-emerald-900">{status}</p>
                        </div>
                      )}
                    </div>

                    <input
                      type="text"
                      value={employeeName}
                      readOnly
                      placeholder="社員名（自動）"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 text-lg text-slate-900
                                 placeholder:text-slate-400 shadow-sm outline-none
                                 ring-1 ring-black/5"
                    />
                  </div>
                </section>

                <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={checkPasswordAndReRegister}
                      disabled={!canReRegister}
                      className={[
                        'h-16 w-full rounded-3xl text-2xl font-extrabold text-white shadow-sm transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                        canReRegister ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed',
                      ].join(' ')}
                    >
                      {isReRegistering ? '再登録中...' : '再登録'}
                    </button>

                    <button
                      onClick={verifyFace}
                      disabled={!canVerify}
                      className={[
                        'h-16 w-full rounded-3xl text-2xl font-extrabold text-white shadow-sm transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2',
                        canVerify
                          ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-rose-700'
                          : 'bg-slate-300 cursor-not-allowed',
                      ].join(' ')}
                    >
                      {verifyText}
                    </button>
                  </div>
                </section>
              </aside>
            </div>
          </main>

          {/* 管理者パスワード */}
          <Dialog open={passwordDialogOpen} onClose={closePasswordDialog}>
            <DialogTitle style={{ fontSize: '1.3rem', fontWeight: 800 }}>管理者パスワード</DialogTitle>
            <DialogContent>
              <DialogContentText style={{ fontSize: '1.05rem', lineHeight: 1.7 }}>
                顔再登録を行うには管理者パスワードを入力してください
              </DialogContentText>

              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-lg outline-none
                           focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                placeholder="パスワード"
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={closePasswordDialog}
                variant="contained"
                style={{ backgroundColor: '#64748b', color: 'white', fontSize: '1rem' }}
              >
                キャンセル
              </Button>
              <Button
                onClick={handlePasswordSubmit}
                variant="contained"
                style={{ backgroundColor: '#2563eb', color: 'white', fontSize: '1rem' }}
              >
                OK
              </Button>
            </DialogActions>
          </Dialog>

          {/* 確認（override / 低類似度） */}
          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
            <DialogTitle style={{ fontSize: '1.3rem', fontWeight: 800 }}>確認</DialogTitle>
            <DialogContent>
              <DialogContentText
                style={{ fontSize: '1.1rem', lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: dialogContent }}
              />
              {dialogMode === 'lowSimilarityConfirm' && currentSimilarityScore !== null && (
                <p style={{ marginTop: 12, fontSize: '1rem', color: '#334155' }}>
                  類似度: {currentSimilarityScore.toFixed(2)}
                </p>
              )}
            </DialogContent>
            <DialogActions>
              {dialogMode === 'confirm' && (
                <>
                  <Button
                    onClick={handleNo}
                    variant="contained"
                    style={{ backgroundColor: '#ef4444', color: 'white', fontSize: '1rem' }}
                  >
                    No
                  </Button>
                  <Button
                    onClick={handleYesLegacy}
                    variant="contained"
                    style={{ backgroundColor: '#2563eb', color: 'white', fontSize: '1rem' }}
                  >
                    Yes
                  </Button>
                </>
              )}

              {dialogMode === 'lowSimilarityConfirm' && (
                <>
                  <Button
                    onClick={handleCancelLowSimilarity}
                    variant="contained"
                    style={{ backgroundColor: '#64748b', color: 'white', fontSize: '1rem' }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleForceProceedLowSimilarity}
                    variant="contained"
                    style={{ backgroundColor: '#f59e0b', color: 'white', fontSize: '1rem' }}
                  >
                    続行
                  </Button>
                </>
              )}
            </DialogActions>
          </Dialog>

          <ToastContainer />
        </div>
      </div>
    </div>
  );
};

export default ReRegister;
