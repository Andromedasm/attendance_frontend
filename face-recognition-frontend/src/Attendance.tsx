import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles.scss';
import { ToastContainer, toast, Id } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PUNCH_TIMEOUT_MS = 30_000;
const CAMERA_TIMEOUT_MS = 10_000;
const CAPTURE_TIMEOUT_MS = 5_000;
const FRESH_FRAME_TIMEOUT_MS = 2_000;
const CONFIRM_TIMEOUT_MS = 20_000;

class AttendanceTimeoutError extends Error {}
class AttendanceHttpError extends Error {
    constructor(message: string, readonly resultUncertain = false) { super(message); }
}

type AttendanceCandidate = {
    id: string; employee_number?: string; employee_name?: string;
    thumbnail?: string | null; eligible: boolean; error?: string;
};
type AttendanceResponse = {
    detail?: string; error?: string; override?: boolean; status?: string;
    employee_number?: string; employee_name?: string; attendance_time?: string;
    confirmation_token?: string; selection_required?: boolean; selection_token?: string;
    expires_in_seconds?: number; thumbnail?: string | null; previous_attendance_times?: string[];
    candidates?: AttendanceCandidate[]; results?: AttendanceResponse[]; result_uncertain?: boolean;
};
type PendingSelection = { data: AttendanceResponse; deviceTime: string; punchStatus: number; expiresAt: number };
type PendingConfirmation = PendingSelection;
type AttendanceOperation = {
    kind: 'initial' | 'selection' | 'override'; punchStatus: number;
    token?: string; candidateIds?: string[]; deviceTime?: string; expiresAt?: number;
};

// Keep a separate deadline: aborting fetch need not finish immediately on Safari.
const withAttendanceTimeout = <T,>(
    operation: () => Promise<T>, signal: AbortSignal, timeoutMs: number, message: string,
): Promise<T> => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        callback();
    };
    const onAbort = () => finish(() => reject(new DOMException('操作を中止しました', 'AbortError')));
    const onTimeout = () => finish(() => reject(new AttendanceTimeoutError(message)));
    const timer = window.setTimeout(onTimeout, timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    Promise.resolve().then(() => {
        if (signal.aborted) throw new DOMException('操作を中止しました', 'AbortError');
        return operation();
    }).then(value => {
        if (Date.now() >= deadline) onTimeout();
        else finish(() => resolve(value));
    }, error => finish(() => reject(error)));
});

const videoCanCapture = (video: HTMLVideoElement) => {
    const stream = video.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    return document.visibilityState !== 'hidden' && !video.paused && !video.ended &&
        video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 &&
        !!track && track.readyState === 'live' && track.enabled && !track.muted;
};

const attendanceFrameCounter = (video: HTMLVideoElement): { source: string; count: number } | null => {
    try {
        const count = video.getVideoPlaybackQuality?.().totalVideoFrames;
        if (typeof count === 'number' && Number.isFinite(count) && count > 0) return { source: 'quality', count };
    } catch { /* Older Safari may expose an unsupported quality method. */ }
    const count = (video as HTMLVideoElement & { webkitDecodedFrameCount?: number }).webkitDecodedFrameCount;
    return typeof count === 'number' && Number.isFinite(count) && count > 0
        ? { source: 'webkit', count } : null;
};

// mediaTime is allowed to stay zero for live camera streams. Compare actual
// presented frame counters, never the mediaTime and currentTime timelines.
const waitForFreshAttendanceFrame = (video: HTMLVideoElement, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        const stream = video.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        const deadline = Date.now() + FRESH_FRAME_TIMEOUT_MS;
        let settled = false;
        let callbackId: number | undefined;
        let presentedFrames: number | undefined;
        let useCallbacks = typeof video.requestVideoFrameCallback === 'function';
        let counter = attendanceFrameCounter(video);
        let initialTime = video.currentTime;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            window.clearInterval(interval);
            window.clearTimeout(timeout);
            if (callbackId !== undefined) {
                try { video.cancelVideoFrameCallback?.(callbackId); } catch { /* Already dispatched. */ }
            }
            signal.removeEventListener('abort', onAbort);
            if (error) reject(error); else resolve();
        };
        const onAbort = () => finish(new DOMException('操作を中止しました', 'AbortError'));
        const validSource = () => {
            if (signal.aborted) { onAbort(); return false; }
            if (Date.now() >= deadline) {
                finish(new AttendanceTimeoutError('カメラの映像が更新されていません。映像を確認してもう一度操作してください'));
                return false;
            }
            if (document.visibilityState === 'hidden' || !stream || video.srcObject !== stream ||
                !track || stream.getVideoTracks()[0] !== track || track.readyState !== 'live' || !track.enabled || video.ended) {
                finish(new Error('カメラの映像が中断されました。カメラを再開してください'));
                return false;
            }
            return !settled;
        };
        const requestFrame = () => {
            if (settled || !useCallbacks) return;
            try { callbackId = video.requestVideoFrameCallback(onFrame); }
            catch {
                // A present-but-unsupported API may throw. A supported API
                // that simply stops producing frames must still time out.
                useCallbacks = false;
                counter = attendanceFrameCounter(video);
                initialTime = video.currentTime;
            }
        };
        const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
            callbackId = undefined;
            if (!validSource()) return;
            if (!videoCanCapture(video)) presentedFrames = undefined;
            else if (Number.isFinite(metadata.presentedFrames)) {
                if (presentedFrames !== undefined && metadata.presentedFrames > presentedFrames) { finish(); return; }
                presentedFrames = metadata.presentedFrames;
            }
            requestFrame();
        };
        const interval = window.setInterval(() => {
            if (!validSource()) return;
            if (!videoCanCapture(video)) {
                presentedFrames = undefined;
                counter = attendanceFrameCounter(video);
                initialTime = video.currentTime;
                return;
            }
            if (useCallbacks) return;
            const next = attendanceFrameCounter(video);
            if (counter) {
                if (next?.source === counter.source && next.count > counter.count) finish();
                // Never substitute a ticking playback clock for a stalled
                // decoded-frame counter that the browser already supports.
            } else if (next) counter = next;
            else if (video.currentTime > initialTime) finish();
        }, 40);
        const timeout = window.setTimeout(() => finish(new AttendanceTimeoutError(
            'カメラの映像が更新されていません。映像を確認してもう一度操作してください',
        )), FRESH_FRAME_TIMEOUT_MS);
        signal.addEventListener('abort', onAbort, { once: true });
        if (validSource()) requestFrame();
    });

const Attendance: React.FC = () => {
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const mountedRef = useRef(true);
    const activePunchRef = useRef<AbortController | null>(null);
    const activeSubmittedRef = useRef(false);
    const cameraStartRef = useRef<AbortController | null>(null);
    const trackCleanupRef = useRef<(() => void) | null>(null);
    const frameEpochRef = useRef(0);
    const pendingGenerationRef = useRef(0);
    const selectionRef = useRef<PendingSelection | null>(null);
    const confirmationsRef = useRef<PendingConfirmation[]>([]);
    const selectedCandidatesRef = useRef<string[]>([]);
    const statusRef = useRef(0);

    const [selectedStatus, setSelectedStatus] = useState(0);
    statusRef.current = selectedStatus;
    const [buttonText, setButtonText] = useState('Start Video');
    const [isPunching, setIsPunching] = useState(false);
    const [isStartingCamera, setIsStartingCamera] = useState(false);
    const [selection, setSelectionState] = useState<PendingSelection | null>(null);
    const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
    const [confirmations, setConfirmationsState] = useState<PendingConfirmation[]>([]);
    const [, setConfirmationClock] = useState(0);
    const [attendanceDetails, setAttendanceDetails] = useState<{
        employee_number: string; employee_name: string; attendance_time: string; status: string;
    }[]>([]);
    const [manualOverride, setManualOverride] = useState(false);
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());
    const [cameraOffToastId, setCameraOffToastId] = useState<Id | null>(null);

    const updateSelection = useCallback((next: PendingSelection | null) => {
        selectionRef.current = next;
        selectedCandidatesRef.current = [];
        setSelectionState(next);
        setSelectedCandidates([]);
    }, []);
    const updateConfirmations = useCallback((next: PendingConfirmation[]) => {
        confirmationsRef.current = next;
        setConfirmationsState(next);
    }, []);
    const clearPending = useCallback(() => {
        pendingGenerationRef.current += 1;
        updateSelection(null);
        updateConfirmations([]);
    }, [updateSelection, updateConfirmations]);
    const resetInactivityTimer = useCallback(() => setLastActivityTime(Date.now()), []);
    const playSuccessSound = useCallback(() => {
        new Audio('/sounds/success-sound.mp3').play().catch(error => {
            console.warn('Failed to play success audio:', error);
        });
    }, []);
    const playAlertSound = useCallback(() => {
        new Audio('/sounds/alert-sound.mp3').play().catch(error => {
            console.warn('Failed to play alert audio:', error);
        });
    }, []);
    const resetPunchingButton = useCallback(() => {
        setIsPunching(false);
        setButtonText(videoRef.current?.srcObject ? '打刻開始' : 'Start Video');
    }, []);

    const stopVideo = useCallback(() => {
        frameEpochRef.current += 1;
        clearPending();
        cameraStartRef.current?.abort();
        cameraStartRef.current = null;
        if (activePunchRef.current) {
            if (activeSubmittedRef.current) {
                toast.warn('通信中にカメラが中断されました。打刻が記録されている可能性があります。打刻履歴を確認してください。', {
                    autoClose: false,
                });
            }
            activePunchRef.current.abort();
        }
        trackCleanupRef.current?.();
        trackCleanupRef.current = null;
        const video = videoRef.current;
        const stream = video?.srcObject as MediaStream | null;
        if (video) video.srcObject = null;
        stream?.getTracks().forEach(track => track.stop());
        if (mountedRef.current) {
            setIsStartingCamera(false);
            resetPunchingButton();
        }
    }, [clearPending, resetPunchingButton]);

    useEffect(() => {
        mountedRef.current = true;
        const video = videoRef.current;
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') stopVideo();
        };
        const onPageHide = () => stopVideo();
        // pause/emptied can be temporary on Safari (including while a dialog
        // is open). Invalidate an in-flight photo, but keep the live source
        // and the original confirmation deadline. Never resend a POST here.
        const onVideoInterrupted = () => {
            if (video?.srcObject) frameEpochRef.current += 1;
        };
        const onVideoEnded = () => { if (video?.srcObject) stopVideo(); };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onPageHide);
        video?.addEventListener('pause', onVideoInterrupted);
        video?.addEventListener('ended', onVideoEnded);
        video?.addEventListener('emptied', onVideoInterrupted);
        return () => {
            mountedRef.current = false;
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPageHide);
            video?.removeEventListener('pause', onVideoInterrupted);
            video?.removeEventListener('ended', onVideoEnded);
            video?.removeEventListener('emptied', onVideoInterrupted);
            activePunchRef.current?.abort();
            activePunchRef.current = null;
            cameraStartRef.current?.abort();
            cameraStartRef.current = null;
            selectionRef.current = null;
            confirmationsRef.current = [];
            trackCleanupRef.current?.();
            trackCleanupRef.current = null;
            const stream = video?.srcObject as MediaStream | null;
            if (video) video.srcObject = null;
            stream?.getTracks().forEach(track => track.stop());
        };
    }, [stopVideo]);

    useEffect(() => {
        if (!attendanceDetails.length) return;
        const timer = window.setTimeout(() => setAttendanceDetails([]), 5000);
        return () => window.clearTimeout(timer);
    }, [attendanceDetails]);

    // Preserve the existing automatic attendance type and manual override timing.
    useEffect(() => {
        const checkStatus = () => {
            if (manualOverride) return;
            const currentHour = new Date().getHours();
            if (currentHour >= 4 && currentHour < 15) {
                if (selectedStatus !== 1) setSelectedStatus(1);
            } else {
                if (selectedStatus !== 2) setSelectedStatus(2);
            }
        };
        checkStatus();
        const interval = window.setInterval(checkStatus, 60000);
        return () => window.clearInterval(interval);
    }, [selectedStatus, manualOverride]);

    useEffect(() => { clearPending(); }, [selectedStatus, clearPending]);

    useEffect(() => {
        if (!selection && !confirmations.length) return;
        const interval = window.setInterval(() => {
            const now = Date.now();
            let expired = false;
            if (selectionRef.current && now >= selectionRef.current.expiresAt) {
                updateSelection(null);
                expired = true;
            }
            const remaining = confirmationsRef.current.filter(item => now < item.expiresAt);
            if (remaining.length !== confirmationsRef.current.length) {
                updateConfirmations(remaining);
                expired = true;
            }
            if (expired) {
                toast.info('確認の有効期限が切れました。もう一度打刻してください。', { autoClose: 5000 });
            }
            setConfirmationClock(value => value + 1);
        }, 250);
        return () => window.clearInterval(interval);
    }, [selection, confirmations, updateSelection, updateConfirmations]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const diff = Date.now() - lastActivityTime;
            if (buttonText === '打刻開始' && !activePunchRef.current && !cameraStartRef.current && diff >= 900000) {
                stopVideo();
            }
            if (diff >= 3600000) navigate('/');
        }, 10_000);
        return () => window.clearInterval(interval);
    }, [buttonText, lastActivityTime, navigate, stopVideo]);

    const startVideo = useCallback(async () => {
        if (cameraStartRef.current || activePunchRef.current || !mountedRef.current || document.visibilityState === 'hidden') return;
        clearPending();
        resetInactivityTimer();
        const controller = new AbortController();
        cameraStartRef.current = controller;
        setIsStartingCamera(true);
        let acquiredStream: MediaStream | undefined;
        try {
            await withAttendanceTimeout(async () => {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                acquiredStream = stream;
                if (controller.signal.aborted || !mountedRef.current || document.visibilityState === 'hidden') {
                    stream.getTracks().forEach(track => track.stop());
                    throw new DOMException('操作を中止しました', 'AbortError');
                }
                const video = videoRef.current;
                if (!video) {
                    stream.getTracks().forEach(track => track.stop());
                    throw new Error('カメラを開始できません');
                }
                video.srcObject = stream;
                const onEnded = () => {
                    if (videoRef.current?.srcObject === stream) stopVideo();
                };
                const onMuted = () => {
                    if (videoRef.current?.srcObject === stream) frameEpochRef.current += 1;
                };
                stream.getVideoTracks().forEach(track => {
                    track.addEventListener('ended', onEnded);
                    track.addEventListener('mute', onMuted);
                });
                trackCleanupRef.current = () => stream.getVideoTracks().forEach(track => {
                    track.removeEventListener('ended', onEnded);
                    track.removeEventListener('mute', onMuted);
                });
                await video.play();
                await waitForFreshAttendanceFrame(video, controller.signal);
            }, controller.signal, CAMERA_TIMEOUT_MS, 'カメラの起動がタイムアウトしました');
            if (mountedRef.current && cameraStartRef.current === controller) {
                setButtonText('打刻開始');
            }
        } catch (error) {
            if (cameraStartRef.current !== controller || !mountedRef.current) return;
            trackCleanupRef.current?.();
            trackCleanupRef.current = null;
            const video = videoRef.current;
            if (video && video.srcObject === acquiredStream) video.srcObject = null;
            acquiredStream?.getTracks().forEach(track => track.stop());
            setButtonText('Start Video');
            playAlertSound();
            toast.error(`ビデオを開始できません: ${error instanceof Error ? error.message : String(error)}`, { autoClose: 5000 });
        } finally {
            controller.abort();
            if (cameraStartRef.current === controller) {
                cameraStartRef.current = null;
                if (mountedRef.current) setIsStartingCamera(false);
            }
        }
    }, [clearPending, resetInactivityTimer, stopVideo, playAlertSound]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const video = videoRef.current;
            if (!video || buttonText !== '打刻開始' || activePunchRef.current || cameraStartRef.current) return;
            const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
            if (video.paused && track?.readyState === 'live' && !track.muted &&
                !selectionRef.current && !confirmationsRef.current.length && document.visibilityState !== 'hidden') {
                // Resume the same stream. Freshness is checked at capture;
                // a temporary playback pause must not close the camera.
                void video.play().catch(() => {});
            }
        }, 60_000);
        return () => window.clearInterval(interval);
    }, [buttonText]);

    useEffect(() => {
        if (buttonText === 'Start Video') {
            if (!cameraOffToastId) {
                setCameraOffToastId(toast.info(
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                        📷カメラがオフです。<br />👆Start Videoを押して起動してください。
                    </div>, { autoClose: false, closeOnClick: false, draggable: false }
                ));
            }
        } else if (cameraOffToastId) {
            toast.dismiss(cameraOffToastId);
            setCameraOffToastId(null);
        }
    }, [buttonText, cameraOffToastId]);

    const captureAttendanceImage = async (signal: AbortSignal): Promise<Blob> => {
        const video = videoRef.current;
        if (!video) throw new Error('カメラを再開してください');
        const stream = video.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        if (!track || track.readyState !== 'live' || !track.enabled || document.visibilityState === 'hidden') {
            throw new Error('カメラを再開してください');
        }
        if (video.paused || video.readyState < 2) {
            await withAttendanceTimeout(() => video.play(), signal, FRESH_FRAME_TIMEOUT_MS,
                'カメラの再生を再開できません。映像を確認してもう一度操作してください');
        }
        const epoch = frameEpochRef.current;
        const assertCurrentFrame = () => {
            if (signal.aborted) throw new DOMException('操作を中止しました', 'AbortError');
            if (videoRef.current !== video || video.srcObject !== stream ||
                frameEpochRef.current !== epoch || !videoCanCapture(video)) {
                throw new Error('撮影中に映像が中断されました。映像を確認してもう一度操作してください');
            }
        };
        await waitForFreshAttendanceFrame(video, signal);
        assertCurrentFrame();
        const blob = await withAttendanceTimeout(() => new Promise<Blob>((resolve, reject) => {
            try { assertCurrentFrame(); } catch (error) { reject(error); return; }
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) { reject(new Error('画像取得に失敗しました')); return; }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('画像取得に失敗しました'));
            }, 'image/png');
        }), signal, CAPTURE_TIMEOUT_MS, '画像の取得がタイムアウトしました。カメラの映像を確認してください');
        assertCurrentFrame();
        return blob;
    };

    const showAttendanceSuccess = (data: AttendanceResponse, punchStatus: number) => {
        playSuccessSound();
        const detail = {
            employee_number: data.employee_number || '', employee_name: data.employee_name || '',
            attendance_time: data.attendance_time || '', status: punchStatus === 1 ? '出勤' : '退勤',
        };
        setAttendanceDetails(previous => [...previous.filter(item => item.employee_number !== detail.employee_number), detail]);
        toast.success(
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                打刻記録が成功しました<br />社員番号: {data.employee_number}<br />
                社員名: {data.employee_name}<br />打刻時間: {data.attendance_time}<br />
                打刻種類: {punchStatus === 1 ? '出勤' : '退勤'}
            </div>, { autoClose: 5000 }
        );
    };

    const submitAttendance = async (operation: AttendanceOperation) => {
        if (activePunchRef.current || cameraStartRef.current || !mountedRef.current || document.visibilityState === 'hidden') return;
        if (operation.expiresAt !== undefined && Date.now() >= operation.expiresAt) {
            clearPending();
            toast.info('確認の有効期限が切れました。もう一度打刻してください。', { autoClose: 5000 });
            return;
        }
        resetInactivityTimer();
        const controller = new AbortController();
        const generation = pendingGenerationRef.current;
        activePunchRef.current = controller;
        activeSubmittedRef.current = false;
        setIsPunching(true);
        setButtonText('打刻中...');
        let submitted = false;
        try {
            const { data, deviceTime } = await withAttendanceTimeout(async () => {
                const blob = await captureAttendanceImage(controller.signal);
                if (controller.signal.aborted) throw new DOMException('操作を中止しました', 'AbortError');
                if (generation !== pendingGenerationRef.current || statusRef.current !== operation.punchStatus) {
                    throw new Error('操作内容が変わりました。もう一度打刻してください');
                }
                if (operation.expiresAt !== undefined && Date.now() >= operation.expiresAt) {
                    throw new Error('確認の有効期限が切れました。もう一度打刻してください');
                }
                const deviceTime = operation.deviceTime || new Date().toISOString();
                const formData = new FormData();
                formData.append('device_time_str', deviceTime);
                formData.append('image', blob, 'attendance.png');
                formData.append('status', operation.punchStatus.toString());
                if (operation.kind === 'selection') {
                    formData.append('selection_token', operation.token || '');
                    formData.append('selected_candidate_ids', JSON.stringify(operation.candidateIds || []));
                } else if (operation.kind === 'override') {
                    formData.append('override', 'true');
                    formData.append('confirmation_token', operation.token || '');
                }
                submitted = true;
                activeSubmittedRef.current = true;
                const response = await fetch('/api/record_attendance', { method: 'POST', body: formData, signal: controller.signal });
                let data: AttendanceResponse;
                try { data = await response.json(); }
                catch (error) {
                    if (!response.ok) throw new AttendanceHttpError('打刻に失敗しました(未知エラー)', response.status >= 500);
                    throw error;
                }
                if (!response.ok) {
                    throw new AttendanceHttpError(data?.detail || data?.error || '打刻に失敗しました(未知エラー)', response.status >= 500);
                }
                if (!data || typeof data !== 'object') throw new Error('サーバーの応答を確認できません');
                return { data, deviceTime };
            }, controller.signal, PUNCH_TIMEOUT_MS, '通信がタイムアウトしました');
            if (!mountedRef.current || activePunchRef.current !== controller || controller.signal.aborted) return;
            const allowConfirmation = generation === pendingGenerationRef.current &&
                statusRef.current === operation.punchStatus && !document.hidden;
            const deadlineFor = (result: AttendanceResponse) => Date.now() + Math.max(0,
                Math.min(CONFIRM_TIMEOUT_MS, (result.expires_in_seconds ?? 20) * 1000));
            if (data.selection_required) {
                if (allowConfirmation && data.selection_token && Array.isArray(data.candidates)) {
                    updateSelection({ data, deviceTime, punchStatus: operation.punchStatus, expiresAt: deadlineFor(data) });
                } else {
                    toast.info('操作内容が変わりました。もう一度打刻してください。', { autoClose: 5000 });
                }
            } else {
                const pending: PendingConfirmation[] = [];
                for (const result of data.results || [data]) {
                    if (result.error) {
                        playAlertSound();
                        toast.error(`${result.employee_name || result.employee_number || ''} ${result.error}${
                            result.result_uncertain ? '。打刻履歴を確認してから再操作してください。' : ''
                        }`, { autoClose: result.result_uncertain ? false : 5000 });
                    } else if (result.override) {
                        if (allowConfirmation && result.confirmation_token) {
                            pending.push({ data: result, deviceTime, punchStatus: operation.punchStatus, expiresAt: deadlineFor(result) });
                        } else {
                            toast.info('確認をやり直してください。もう一度打刻してください。', { autoClose: 5000 });
                        }
                    } else {
                        showAttendanceSuccess(result, operation.punchStatus);
                    }
                }
                if (pending.length) updateConfirmations([...confirmationsRef.current, ...pending]);
            }
        } catch (error) {
            if (!mountedRef.current || activePunchRef.current !== controller || controller.signal.aborted) return;
            console.error('Attendance error:', error);
            playAlertSound();
            const uncertain = submitted && (!(error instanceof AttendanceHttpError) || error.resultUncertain);
            const detail = error instanceof Error ? error.message : String(error);
            toast.error(uncertain
                ? `${detail}。打刻が記録されている可能性があります。打刻履歴を確認してから再操作してください。`
                : `${operation.kind === 'override' ? '上書き操作' : '打刻'}に失敗しました: ${detail}`,
            { autoClose: uncertain ? false : 5000 });
        } finally {
            controller.abort();
            if (activePunchRef.current === controller) {
                activePunchRef.current = null;
                activeSubmittedRef.current = false;
                if (mountedRef.current) resetPunchingButton();
            }
        }
    };

    const startAttendance = () => {
        resetInactivityTimer();
        if (selectionRef.current || confirmationsRef.current.length) return;
        if (selectedStatus === 0) {
            playAlertSound();
            toast.error('打刻種類を選択してください', { autoClose: 5000 });
            return;
        }
        setAttendanceDetails([]);
        void submitAttendance({ kind: 'initial', punchStatus: selectedStatus });
    };

    const confirmSelection = (pending: PendingSelection) => {
        if (selectionRef.current !== pending || activePunchRef.current || !selectedCandidatesRef.current.length) return;
        const ids = selectedCandidatesRef.current.filter(id => pending.data.candidates?.some(item => item.id === id && item.eligible));
        if (!ids.length) return;
        updateSelection(null);
        void submitAttendance({ kind: 'selection', punchStatus: pending.punchStatus, deviceTime: pending.deviceTime,
            expiresAt: pending.expiresAt, token: pending.data.selection_token, candidateIds: ids });
    };
    const confirmOverride = (pending: PendingConfirmation) => {
        if (confirmationsRef.current[0] !== pending || activePunchRef.current) return;
        updateConfirmations(confirmationsRef.current.slice(1));
        void submitAttendance({ kind: 'override', punchStatus: pending.punchStatus, deviceTime: pending.deviceTime,
            expiresAt: pending.expiresAt, token: pending.data.confirmation_token });
    };
    const handleStatusClick = (status: number) => {
        resetInactivityTimer();
        if (statusRef.current !== status) clearPending();
        statusRef.current = status;
        setSelectedStatus(status);
        setManualOverride(true);
        setTimeout(() => { setManualOverride(false); }, 300000);
    };
    const confirmation = confirmations[0];
    const remainingSeconds = (expiresAt: number) => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

    return (
        <div className="flex h-screen font-sans antialiased bg-gray-200">
            <Sidebar />
            <div className="flex-1 flex flex-col items-center justify-center p-10">
                {selection && (
                    <Dialog open onClose={() => updateSelection(null)} maxWidth="md" fullWidth>
                        <DialogTitle style={{ fontSize: '1.5rem' }}>打刻する社員を選択してください</DialogTitle>
                        <DialogContent>
                            <DialogContentText>
                                今回打刻する方だけを選択してください。確認後、もう一度カメラで本人を確認します。
                            </DialogContentText>
                            <p className="my-3 font-semibold" aria-live="polite">
                                {selection.punchStatus === 1 ? '出勤' : '退勤'} · 確認期限: あと{remainingSeconds(selection.expiresAt)}秒
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {selection.data.candidates?.map(candidate => (
                                    <label key={candidate.id} className={`flex items-center gap-4 rounded-xl border p-4 ${
                                        candidate.eligible ? 'cursor-pointer border-slate-300' : 'border-slate-200 bg-slate-100 text-slate-500'
                                    }`}>
                                        <input type="checkbox" aria-label={`打刻対象 ${candidate.employee_number || candidate.id}`}
                                            className="h-6 w-6" checked={selectedCandidates.includes(candidate.id)}
                                            disabled={!candidate.eligible || isPunching}
                                            onChange={event => {
                                                const next = event.target.checked
                                                    ? [...new Set([...selectedCandidatesRef.current, candidate.id])]
                                                    : selectedCandidatesRef.current.filter(id => id !== candidate.id);
                                                selectedCandidatesRef.current = next;
                                                setSelectedCandidates(next);
                                            }} />
                                        {candidate.thumbnail && <img src={candidate.thumbnail} alt="確認用の顔写真" className="h-20 w-20 rounded-lg object-cover" />}
                                        <span>
                                            <strong className="block text-xl">{candidate.employee_name || '未識別'}</strong>
                                            <span className="block">社員番号: {candidate.employee_number || '－'}</span>
                                            {!candidate.eligible && <span className="block text-sm">{candidate.error || '本人を確認できません'}</span>}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => updateSelection(null)} disabled={isPunching}>キャンセル</Button>
                            <Button onClick={() => confirmSelection(selection)} variant="contained"
                                disabled={isPunching || !selectedCandidates.length || remainingSeconds(selection.expiresAt) === 0}>
                                選択した社員を打刻
                            </Button>
                        </DialogActions>
                    </Dialog>
                )}
                {confirmation && !isPunching && (
                    <Dialog open onClose={() => {
                        if (confirmationsRef.current[0] === confirmation) updateConfirmations(confirmationsRef.current.slice(1));
                    }} maxWidth="md" fullWidth>
                        <DialogTitle style={{ fontSize: '1.5rem' }}>打刻の上書き確認</DialogTitle>
                        <DialogContent>
                            <div className="mb-4 flex items-center gap-4">
                                {confirmation.data.thumbnail && <img src={confirmation.data.thumbnail} alt="確認用の顔写真" className="h-24 w-24 rounded-lg object-cover" />}
                                <div>
                                    <p className="text-2xl font-bold">{confirmation.data.employee_name}</p>
                                    <p>社員番号: {confirmation.data.employee_number}</p>
                                </div>
                            </div>
                            <DialogContentText style={{ fontSize: '1.25rem' }}>
                                {confirmation.punchStatus === 1 ? '出勤' : '退勤'}の記録を上書きしますか？
                            </DialogContentText>
                            <p className="mt-3 font-semibold">上書き対象の打刻時間:</p>
                            <ul className="my-2 list-inside list-disc">
                                {(confirmation.data.previous_attendance_times || [confirmation.data.attendance_time]).map((time, index) => <li key={`${time}-${index}`}>{time}</li>)}
                            </ul>
                            <p>YESを押すと新しい映像で同じ社員か確認します。本人がカメラの前に立ってください。</p>
                            <p className="mt-3 font-semibold" aria-live="polite">確認期限: あと{remainingSeconds(confirmation.expiresAt)}秒</p>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => {
                                if (confirmationsRef.current[0] === confirmation) updateConfirmations(confirmationsRef.current.slice(1));
                            }} disabled={isPunching} style={{ backgroundColor: 'red', color: 'white', fontSize: '1.25rem' }}>NO</Button>
                            <Button onClick={() => confirmOverride(confirmation)}
                                disabled={isPunching || remainingSeconds(confirmation.expiresAt) === 0}
                                style={{ backgroundColor: 'blue', color: 'white', fontSize: '1.25rem' }}>YES</Button>
                        </DialogActions>
                    </Dialog>
                )}
                <div className="flex flex-col items-center justify-center h-full">
                    <video ref={videoRef} width="640" height="480" className="rounded-lg shadow-lg mb-4" autoPlay playsInline muted />
                    <div className="mb-4 flex gap-6">
                        <button className={`
                            text-white bg-linear-to-r from-cyan-500 to-blue-500 hover:bg-linear-to-bl
                            focus:outline-hidden font-medium text-2xl px-24 py-10 text-center transition-transform
                            transform rounded-lg
                            ${selectedStatus === 1 ? 'scale-110 ring-4 ring-yellow-300 ring-offset-2 ring-offset-blue-500 border-4 border-white shadow-xl' : 'shadow-md'}
                        `} onClick={event => { event.stopPropagation(); handleStatusClick(1); }}>
                            {selectedStatus === 1 ? '🚀 出勤' : '出勤'}
                        </button>
                        <button className={`
                            text-white bg-linear-to-br from-pink-500 to-orange-400 hover:bg-linear-to-bl
                            focus:outline-hidden font-medium text-2xl px-24 py-10 text-center transition-transform
                            transform rounded-lg
                            ${selectedStatus === 2 ? 'scale-110 ring-4 ring-pink-300 ring-offset-2 ring-offset-orange-400 border-4 border-white shadow-xl' : 'shadow-md'}
                        `} onClick={event => { event.stopPropagation(); handleStatusClick(2); }}>
                            {selectedStatus === 2 ? '🌙 退勤' : '退勤'}
                        </button>
                        <button onClick={buttonText === 'Start Video' ? startVideo : startAttendance}
                            disabled={isPunching || isStartingCamera} className={`
                            text-white font-semibold text-3xl px-16 py-8 transition-transform transform
                            focus:outline-hidden focus:ring-2 focus:ring-white/75 rounded-full shadow-md
                            ${isPunching || isStartingCamera ? 'bg-gray-400 cursor-not-allowed' : buttonText === 'Start Video' ? 'bg-green-500 hover:bg-green-700' : 'bg-blue-500 hover:bg-blue-700'}
                        `}>{isStartingCamera ? 'カメラ起動中...' : buttonText}</button>
                    </div>
                    {buttonText !== 'Start Video' && (
                        <button className="mb-3 text-sm underline text-slate-600" disabled={isPunching || isStartingCamera}
                            onClick={() => { stopVideo(); void startVideo(); }}>カメラを再起動</button>
                    )}
                    {attendanceDetails.length > 0 && (
                        <section className="mt-4 w-full max-w-3xl rounded-2xl border border-white/60 bg-white/75 px-6 py-4 shadow-lg backdrop-blur-xl" aria-live="polite">
                            <p className="mb-3 text-sm font-bold tracking-[0.2em] text-emerald-700">打刻完了</p>
                            {attendanceDetails.map(detail => (
                                <dl key={detail.employee_number} className="mb-3 grid gap-3 text-slate-700 sm:grid-cols-4">
                                    <div><dt className="text-xs text-slate-500">社員番号</dt><dd className="font-semibold">{detail.employee_number}</dd></div>
                                    <div><dt className="text-xs text-slate-500">社員名</dt><dd className="font-semibold">{detail.employee_name}</dd></div>
                                    <div><dt className="text-xs text-slate-500">打刻時間</dt><dd className="font-semibold">{detail.attendance_time}</dd></div>
                                    <div><dt className="text-xs text-slate-500">打刻種類</dt><dd className="font-semibold">{detail.status}</dd></div>
                                </dl>
                            ))}
                        </section>
                    )}
                </div>
                <ToastContainer />
            </div>
        </div>
    );
};

export default Attendance;
