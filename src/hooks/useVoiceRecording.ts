import { useCallback, useEffect, useRef, useState } from 'react';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useVoiceRecording(options: { maxSeconds?: number } = {}) {
  const maxSeconds = options.maxSeconds ?? 15 * 60;
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  const isSupported = typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;

  const clearTimer = () => {
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; }
  };

  const stop = useCallback(() => {
    clearTimer();
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!isSupported || isRecording) return;
    setError(null);
    setRecording(null);
    chunks.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0];
        setRecording(chunks.current.length ? new Blob(chunks.current, { type }) : null);
        setIsRecording(false);
      };
      recorder.current = rec;
      rec.start(1000);
      setSeconds(0);
      setIsRecording(true);
      timer.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) stop();
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError'
        ? 'Microphone access was refused. Allow it in the browser and try again.'
        : 'The microphone could not be started.');
    }
  }, [isSupported, isRecording, maxSeconds, stop]);

  useEffect(() => () => { clearTimer(); if (recorder.current?.state === 'recording') recorder.current.stop(); }, []);

  return { isSupported, isRecording, seconds, recording, error, start, stop, reset: () => setRecording(null) };
}
