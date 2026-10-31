import React, { useRef, useState } from 'react';
import Sidebar from './Sidebar';
import ThemeBackdrop from './ThemeBackdrop';
import ThemeToggle from './ThemeToggle';
import { useTheme } from './theme-context';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import './styles.scss';
import './recognition.scss';

// 引入 react-toastify
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const ReRegister: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const { theme } = useTheme();

    // 输入的员工编号/姓名
    const [employeeNumber, setEmployeeNumber] = useState('');
    const [employeeName, setEmployeeName] = useState('');

    // 状态显示
    const [status, setStatus] = useState('');
    const [videoStarted, setVideoStarted] = useState<boolean>(false);

    // 是否正在进行"再登録"
    const [isReRegistering, setIsReRegistering] = useState(false);
    const [reRegisterBtnText, setReRegisterBtnText] = useState('再登録開始');

    // 对话框 (统一一个Dialog，根据不同内容/按钮来呈现)
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogContent, setDialogContent] = useState('');     // 显示在对话框中的文字
    const [dialogMode, setDialogMode] = useState<'confirm' | 'lowSimilarity' | ''>('');
    // dialogMode='confirm' => 显示 Yes/No 两按钮 (相似度>=0.5)
    // dialogMode='lowSimilarity' => 显示 三按钮(重试/发送请求/取消)

    // 记录 "logId" 以便发送请求/审批
    const [logId, setLogId] = useState<number | null>(null);

    /** toast简化函数 **/
    const showToastError = (message: string) => {
        toast.error(message, { autoClose: 5000 });
    };
    const showToastInfo = (message: string) => {
        toast.info(message, { autoClose: 5000 });
    };

    /** 获取员工姓名 **/
    const handleEmployeeNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const number = e.target.value;
        setEmployeeNumber(number);

        if (number.trim() !== '') {
            fetch(`/facerec_api/get_employee_name?employeeNumber=${encodeURIComponent(number.trim())}`)
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

    /** 启动摄像头 **/
    const startVideo = () => {
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

    /** 主流程: re_register */
    const reRegister = () => {
        if (!employeeNumber.trim() || !employeeName.trim()) {
            showToastError('社員番号と名前を記入してください');
            return;
        }
        setIsReRegistering(true);
        setReRegisterBtnText('再登録中...');
        setStatus('アップロード中...');

        // 1) 拍照
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

            // 2) 提交
            let formData = new FormData();
            formData.append('image', blob, employeeNumber + '.png');
            formData.append('employeeNumber', employeeNumber);
            formData.append('employeeName', employeeName);
            // 不带 override => 服务器用 override=false

            fetch('/facerec_api/re_register', {
                method: 'POST',
                body: formData,
            })
                .then((res) => res.json())
                .then((data) => {
                    console.log('re_register result:', data);
                    setStatus('');
                    // a) 检查 similarity_check
                    if (data.similarity_check === true && !data.override) {
                        // 说明相似度>=0.5, 需要Yes/No
                        setLogId(data.log_id || null);
                        setDialogContent(`相似度 ${data.similarity_score}, 覆盖旧人脸?`);
                        setDialogMode('confirm');
                        setDialogOpen(true);
                    }
                    else if (data.similarity_check === false) {
                        // 相似度<0.5 => 三按钮
                        setLogId(data.log_id || null);
                        setDialogContent(`相似度 ${data.similarity_score} < 0.5, どうしますか？`);
                        setDialogMode('lowSimilarity');
                        setDialogOpen(true);
                    }
                    else if (data.override_needed) {
                        // 老逻辑: 数据库已存在, 但 override=false => 让用户确认 "上書きしますか？"
                        // 这在相似度逻辑之外, 以防万一
                        setDialogContent('社員番号既に存在します。上書きしますか？');
                        setDialogMode('confirm');
                        setDialogOpen(true);
                        setLogId(null); // 这个跟 logs无关
                    }
                    else {
                        // b) override=true 覆盖成功, 或 message
                        showToastInfo(data.message || '再登録が完了しました');
                    }
                })
                .catch((error) => {
                    setStatus('');
                    console.error('Error re_register:', error);
                    showToastError('エラー: ' + error.message);
                })
                .finally(() => {
                    resetReRegisterButton();
                });
        });
    };

    /** 按钮: 重置再登録状态 */
    const resetReRegisterButton = () => {
        setIsReRegistering(false);
        setStatus('');
        setReRegisterBtnText('再登録開始');
    };

    // -------------- 对话框按钮处理 --------------

    // 情况 A: 相似度>=0.5 => dialogMode='confirm' => Yes => override=true => 2nd fetch
    const handleYes = () => {
        setDialogOpen(false);
        if (!videoRef.current) {
            showToastError('ビデオが準備できていません');
            return;
        }
        // 跟 reRegister几乎一样，但这次 override=true
        let formData = new FormData();
        // 再次拍摄 (可选,你也可以复用第一次拍摄的 blob)
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) {
                showToastError('画像を取得できませんでした');
                return;
            }
            formData.append('image', blob, employeeNumber + '.png');
            formData.append('employeeNumber', employeeNumber);
            formData.append('employeeName', employeeName);
            formData.append('override', 'true');

            fetch('/facerec_api/re_register', {
                method: 'POST',
                body: formData,
            })
                .then((resp) => resp.json())
                .then((data2) => {
                    console.log('override result:', data2);
                    showToastInfo(data2.message || '再登録が完了しました(上書き)');
                })
                .catch((err) => {
                    console.error(err);
                    showToastError('上書き失敗: ' + err.message);
                });
        });
    };
    const handleNo = () => {
        // 不覆盖 => do nothing
        setDialogOpen(false);
        showToastInfo('再登録をキャンセルしました');
    };

    // 情况 B: 相似度<0.5 => dialogMode='lowSimilarity' => 显示(重试/发送请求/取消)
    const handleRetry = () => {
        setDialogOpen(false);
        reRegister(); // 再次调用 reRegister
    };
    const handleSendRequest = () => {
        setDialogOpen(false);
        if (!logId) {
            showToastError('LogIdがありません。');
            return;
        }
        // 发送 /re_register_approval_request
        let formData = new FormData();
        formData.append('log_id', String(logId));
        formData.append('reason', '相似度が低いので管理者に確認お願いします。');

        fetch('/facerec_api/re_register_approval_request', {
            method: 'POST',
            body: formData
        })
            .then((r) => r.json())
            .then((data) => {
                showToastInfo(data.message || '送信しました。管理者承認待ち');
            })
            .catch((err) => {
                console.error(err);
                showToastError('送信失敗:' + err.message);
            });
    };
    const handleCancel = () => {
        setDialogOpen(false);
        showToastInfo('再登録をキャンセルしました');
    };

    return (
        <div className="theme-surface recognition-surface" data-theme={theme}>
            <Sidebar />
            <ThemeToggle />
            <ThemeBackdrop />

            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                maxWidth="md"
                fullWidth
                slotProps={{ paper: { className: 'recognition-dialog' } }}
            >
                <DialogTitle>確認</DialogTitle>
                <DialogContent>
                    <DialogContentText
                        dangerouslySetInnerHTML={{ __html: dialogContent }}
                    />
                </DialogContent>
                <DialogActions>
                    {dialogMode === 'confirm' && (
                        <>
                            <Button
                                onClick={handleNo}
                                className="recognition-dialog-button recognition-dialog-button--danger"
                            >
                                No
                            </Button>
                            <Button
                                onClick={handleYes}
                                className="recognition-dialog-button recognition-dialog-button--primary"
                            >
                                Yes
                            </Button>
                        </>
                    )}
                    {dialogMode === 'lowSimilarity' && (
                        <>
                            <Button
                                onClick={handleRetry}
                                className="recognition-dialog-button recognition-dialog-button--primary"
                            >
                                再試行
                            </Button>
                            <Button
                                onClick={handleSendRequest}
                                className="recognition-dialog-button recognition-dialog-button--primary"
                            >
                                送信
                            </Button>
                            <Button
                                onClick={handleCancel}
                                className="recognition-dialog-button recognition-dialog-button--danger"
                            >
                                キャンセル
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            <main className="recognition-main">
                <section className="recognition-panel">
                    <h1 className="recognition-title">顔データ再登録</h1>

                    <div className="recognition-preview-shell">
                        <video
                            ref={videoRef}
                            width="640"
                            height="480"
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
                                Start Video
                            </button>
                        </div>
                    ) : (
                        <div className="recognition-single-action">
                            <button
                                type="button"
                                onClick={reRegister}
                                disabled={isReRegistering}
                                className="recognition-button recognition-button--primary"
                            >
                                {reRegisterBtnText}
                            </button>
                        </div>
                    )}

                    <div className="recognition-fields">
                        <input
                            type="text"
                            value={employeeNumber}
                            onChange={handleEmployeeNumberChange}
                            placeholder="社員番号"
                            className="recognition-input"
                        />
                        <input
                            type="text"
                            value={employeeName}
                            onChange={(e) => setEmployeeName(e.target.value)}
                            placeholder="社員名"
                            className="recognition-input"
                        />
                    </div>

                    <div className="recognition-feedback" aria-live="polite">
                        <p className="recognition-status">{status}</p>
                    </div>
                </section>
            </main>

            <ToastContainer theme={theme} />
        </div>
    );
};

export default ReRegister;
