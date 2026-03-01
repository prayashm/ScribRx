import { useState, useRef } from 'preact/hooks';
import { startRecording, type AudioResult } from '../lib/audio';

interface Props {
  onResult: (audio: AudioResult) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onResult, disabled }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'error'>('idle');
  const [duration, setDuration] = useState(0);
  const stopRef = useRef<(() => Promise<AudioResult>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStart = async () => {
    try {
      const { stop } = await startRecording();
      stopRef.current = stop;
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      setState('error');
    }
  };

  const handleStop = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopRef.current) {
      const result = await stopRef.current();
      stopRef.current = null;
      setState('idle');
      setDuration(0);
      onResult(result);
    }
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (state === 'error') {
    return (
      <div class="text-center p-4">
        <p class="text-sm text-red-600 mb-2">Microphone access denied.</p>
        <p class="text-xs text-gray-500">Please allow microphone access in your browser settings.</p>
        <button onClick={() => setState('idle')} class="mt-2 text-blue-600 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div class="flex items-center justify-center gap-4 py-3">
      {state === 'idle' ? (
        <button
          onClick={handleStart}
          disabled={disabled}
          class="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center text-white shadow-lg transition-all"
          aria-label="Start recording"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>
      ) : (
        <>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span class="text-sm font-medium text-gray-700">{formatTime(duration)}</span>
          </div>
          <button
            onClick={handleStop}
            class="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-all"
            aria-label="Stop recording"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
