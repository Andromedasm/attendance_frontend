import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import './styles.scss';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const ReRegister: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const [employeeNumber, setEmployeeNumber] = useState('');
    const [employeeName, setEmployeeName] = useState('');

    const [status, setStatus] = useState('');
    const [videoStarted, setVideoStarted] = useState<boolean>(false);
    const [isReRegistering, setIsReRegistering] = useState(false);
    const [reRegisterBtnText, setReRegisterBtnText] = useState('再登録開始');
    const [reRegisterBtnClass, setReRegisterBtnClass] = useState(
        'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 focus:outline-none ...'
    );

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogContent, setDialogContent] = useState('');
    // Add new mode for low similarity confirmation
    const [dialogMode, setDialogMode] = useState<'confirm' | 'lowSimilarityRequest' | 'lowSimilarityConfirm' | ''>('');
    const [logId, setLogId] = useState<number | null>(null); // Kept for 'lowSimilarityRequest' if ever re-enabled
    const [currentSimilarityScore, setCurrentSimilarityScore] = useState<number | null>(null);


    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [lastAuthTime, setLastAuthTime] = useState<number | null>(null);

    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyText, setVerifyText] = useState('認証');

    const showToastError = (msg: string) => { toast.error(msg, { autoClose: 5000 }); };
    const showToastInfo = (msg: string) => { toast.info(msg, { autoClose: 5000 }); };
    const showToastInfoHTML = (htmlStr: string) => { toast.info(<div dangerouslySetInnerHTML={{ __html: htmlStr }} />, { autoClose: 5000 }); };
    const showToastSuccessHTML = (htmlStr: string) => { toast.success(<div dangerouslySetInnerHTML={{ __html: htmlStr }} />, { autoClose: 5000 }); };

    const handleEmployeeNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const number = e.target.value;
        setEmployeeNumber(number);
        // ... (rest of the function is fine) ...
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

    const startVideo = () => { /* ... (no changes needed) ... */ 
        navigator.mediaDevices
            .getUserMedia({ video: { width: 640, height: 480 } })
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setVideoStarted(true);
                }
            })
            .catch((error) => {
                console.error('Error accessing media devices.', error);
                showToastError('ビデオを開始できません: ' + error.message);
            });
    };

    const checkPasswordAndReRegister = () => { /* ... (no changes needed) ... */ 
        if (lastAuthTime && Date.now() - lastAuthTime < 15 * 60 * 1000) {
            reRegister(); // Initial call, no special flags
        } else {
            setPasswordDialogOpen(true);
        }
    };
    const closePasswordDialog = () => { /* ... (no changes needed) ... */ 
        setPasswordDialogOpen(false);
        setAdminPassword('');
    };
    const handlePasswordSubmit = () => { /* ... (no changes needed) ... */ 
        if (!adminPassword.trim()) {
            showToastError('パスワードを入力してください');
            return;
        }
        let formData = new FormData();
        formData.append('password', adminPassword);

        fetch('/api/check_admin_password', {
            method: 'POST',
            body: formData,
        })
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
                reRegister(); // Initial call, no special flags
            })
            .catch((err) => {
                showToastError('パスワードが違います: ' + err.message);
            });
    };
    
    const resetReRegisterButton = () => {
        setIsReRegistering(false);
        // setStatus(''); // Keep status message from backend if any
        setReRegisterBtnText('再登録開始');
        setReRegisterBtnClass(
            'mt-4 px-6 py-3 bg-blue-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-blue-700 ...'
        );
    };

    // ========== 4) 人脸重新注册(主要逻辑) - Modified for new flow ==========
    // This function is for the *initial* re-registration attempt
    const reRegister = (forceOverrideLowSimilarity = false, isLegacyOverride = false) => {
        if (!employeeNumber.trim() || !employeeName.trim()) {
            showToastError('社員番号と名前を記入してください');
            return;
        }
        setIsReRegistering(true);
        setReRegisterBtnText('再登録中...');
        setReRegisterBtnClass('mt-4 px-6 py-3 bg-gray-400 text-white ...');
        setStatus('アップロード中...');

        const canvas = document.createElement('canvas');
        const video = videoRef.current;
        if (!video) {
            showToastError('ビデオが準備できていません');
            resetReRegisterButton();
            return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) {
                showToastError('画像を取得できませんでした');
                resetReRegisterButton();
                return;
            }

            let formData = new FormData();
            formData.append('image', blob, employeeNumber + '.png');
            formData.append('employeeNumber', employeeNumber);
            formData.append('employeeName', employeeName);

            if (forceOverrideLowSimilarity) {
                formData.append('force_override_low_similarity', 'true');
            }
            if (isLegacyOverride) { // For the old 'confirm' dialog path
                formData.append('override', 'true');
            }


            fetch('/api/re_register', {
                method: 'POST',
                body: formData,
            })
            .then(async (res) => { // Added async to handle potential error response body
                if (!res.ok) {
                    // Try to parse error from backend if not 2xx
                    const errorData = await res.json().catch(() => ({ detail: "サーバーエラー" }));
                    throw new Error(errorData.detail || errorData.error || `HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                console.log('re_register result:', data);
                setStatus(data.message || ''); // Display message from backend

                if (data.error) {
                     showToastError(data.error);
                } else if (data.similarity_check === true) { // High similarity, backend handled it
                    showToastSuccessHTML(data.message || '再登録が完了しました (類似度良好)');
                } else if (data.similarity_check === false && data.similarity_score !== undefined) { // Low similarity, ask user
                    setCurrentSimilarityScore(data.similarity_score);
                    setDialogContent(data.message || `類似度 ${data.similarity_score.toFixed(2)} < 0.5。続行しますか？`);
                    setDialogMode('lowSimilarityConfirm'); 
                    setDialogOpen(true);
                } else if (data.override_needed) { // Fallback for old logic / specific backend response
                    setDialogContent(data.message || '社員番号既に存在します。上書きしますか？');
                    setDialogMode('confirm'); // Original confirm dialog
                    setDialogOpen(true);
                } else { // Generic success or info
                    showToastInfo(data.message || '再登録処理が完了しました。');
                }
            })
            .catch((error) => {
                setStatus('');
                console.error('Error re_register:', error);
                showToastError('再登録エラー: ' + error.message);
            })
            .finally(() => {
                resetReRegisterButton();
            });
        });
    };


    // ========== 5) 覆盖对话框(Yes/No) - For legacy 'confirm' dialog ==========
    // This handles the 'confirm' dialog which might be triggered by 'override_needed'
    const handleYesLegacy = () => {
        setDialogOpen(false);
        // Re-take photo and call reRegister with isLegacyOverride = true
        reRegister(false, true); // Sets 'override: true' in backend call
    };
    const handleNo = () => {
        setDialogOpen(false);
        showToastInfo('再登録をキャンセルしました');
    };

    // ========== 6) 相似度<0.5 => [确定继续] / [取消] ==========
    // This handles the NEW 'lowSimilarityConfirm' dialog
    const handleForceProceedLowSimilarity = () => {
        setDialogOpen(false);
        // Re-take photo and call reRegister with forceOverrideLowSimilarity = true
        reRegister(true, false); 
    };
    // handleCancel (from original) can be reused for the cancel button
    const handleCancelLowSimilarity = () => {
        setDialogOpen(false);
        showToastInfo('再登録をキャンセルしました');
    };


    // OLD lowSimilarityRequest handlers (keep if you might re-enable admin approval)
    // const handleRetry = () => { setDialogOpen(false); reRegister(); };
    // const handleSendRequest = () => { /* ... (original logic for sending request to admin) ... */ };
    // const handleCancel = () => { setDialogOpen(false); showToastInfo('再登録をキャンセルしました'); };


    const verifyFace = () => { /* ... (no changes needed) ... */ 
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

            fetch('/api/verify', {
                method: 'POST',
                body: formData,
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
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
        });
    };

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10">
                {/* =========== 管理员密码对话框 =========== */}
                {/* ... (no changes needed) ... */}
                <Dialog open={passwordDialogOpen} onClose={closePasswordDialog}>
                    <DialogTitle style={{ fontSize: '1.5rem' }}>管理者パスワード</DialogTitle>
                    <DialogContent>
                        <DialogContentText style={{ fontSize: '1.25rem' }}>
                            顔再登録を行うには管理者パスワードを入力してください
                        </DialogContentText>
                        <input
                            type="password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            className="mt-4 px-4 py-2 border text-lg rounded-lg"
                            placeholder="パスワード"
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button
                            onClick={closePasswordDialog}
                            style={{ backgroundColor: 'gray', color: 'white', fontSize: '1.25rem' }}
                        >
                            キャンセル
                        </Button>
                        <Button
                            onClick={handlePasswordSubmit}
                            style={{ backgroundColor: 'blue', color: 'white', fontSize: '1.25rem' }}
                        >
                            OK
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* =========== 相似度/override 对话框 - Modified =========== */}
                <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                    <DialogTitle style={{ fontSize: '1.5rem' }}>確認</DialogTitle>
                    <DialogContent>
                        <DialogContentText
                            style={{ fontSize: '1.25rem' }}
                            dangerouslySetInnerHTML={{ __html: dialogContent }}
                        />
                    </DialogContent>
                    <DialogActions>
                        {/* Legacy Confirm Dialog (Yes/No) */}
                        {dialogMode === 'confirm' && (
                            <>
                                <Button onClick={handleNo} style={{ backgroundColor: 'red', color: 'white', fontSize: '1.25rem' }}>No</Button>
                                <Button onClick={handleYesLegacy} style={{ backgroundColor: 'blue', color: 'white', fontSize: '1.25rem' }}>Yes</Button>
                            </>
                        )}
                        {/* New Low Similarity Confirm Dialog (确定继续/取消) */}
                        {dialogMode === 'lowSimilarityConfirm' && (
                            <>
                                <Button onClick={handleCancelLowSimilarity} style={{ backgroundColor: 'gray', color: 'white', fontSize: '1.25rem' }}>キャンセル</Button>
                                <Button onClick={handleForceProceedLowSimilarity} style={{ backgroundColor: 'orange', color: 'white', fontSize: '1.25rem' }}>確定 (続行)</Button>
                            </>
                        )}
                        {/* Old lowSimilarityRequest dialog buttons - remove or keep if needed for other flows */}
                        {/* {dialogMode === 'lowSimilarityRequest' && ( ... )} */}
                    </DialogActions>
                </Dialog>

                {/* ======== 摄像头 ======== */}
                {/* ... (no changes needed) ... */}
                <video
                    ref={videoRef}
                    width="640"
                    height="480"
                    autoPlay
                    playsInline
                    className="rounded-lg shadow-lg mb-4"
                ></video>

                {/* ======== 两个主要按钮: [再登録][認証] ======== */}
                {/* ... (no changes needed, checkPasswordAndReRegister calls the modified reRegister) ... */}
                 {!videoStarted ? (
                    <button
                        onClick={startVideo}
                        className="mt-4 px-6 py-3 bg-green-500 text-white font-semibold text-xl rounded-lg shadow-md hover:bg-green-700 ..."
                    >
                        Start Video
                    </button>
                ) : (
                    <div className="flex space-x-4 mt-4">
                        <button
                            onClick={checkPasswordAndReRegister}
                            disabled={isReRegistering}
                            className={reRegisterBtnClass}
                        >
                            {reRegisterBtnText}
                        </button>
                        <button
                            onClick={verifyFace}
                            disabled={isVerifying}
                            className="mt-4 px-6 py-3 text-white font-semibold text-xl rounded-lg shadow-md
                                       bg-gradient-to-r from-purple-500 via-pink-500 to-red-500
                                       hover:from-purple-600 hover:via-pink-600 hover:to-red-600
                                       transition-all duration-300"
                        >
                            {verifyText}
                        </button>
                    </div>
                )}

                {/* ========== 编号 & 姓名输入框 ========== */}
                {/* ... (no changes needed) ... */}
                <div className="mt-4 flex space-x-4">
                    <input
                        type="text"
                        value={employeeNumber}
                        onChange={handleEmployeeNumberChange}
                        placeholder="社員番号"
                        className="px-4 py-2 border text-lg rounded-lg focus:outline-none ..."
                    />
                    <input
                        type="text"
                        value={employeeName}
                        onChange={(e) => setEmployeeName(e.target.value)}
                        placeholder="社員名"
                        className="px-4 py-2 border text-lg rounded-lg focus:outline-none ..."
                    />
                </div>
                <div className="mt-4 text-sm font-semibold text-gray-500">{status}</div>
            </div>
            <ToastContainer />
        </div>
    );
};

export default ReRegister;