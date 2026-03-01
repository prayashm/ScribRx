export interface AudioResult {
  blob: Blob;
  base64: string;
  mimeType: string;
  durationMs: number;
}

export async function startRecording(): Promise<{ stop: () => Promise<AudioResult> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  const startTime = Date.now();

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  return {
    stop: () =>
      new Promise<AudioResult>((resolve) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: mimeType });
          const base64 = await blobToBase64(blob);
          resolve({
            blob,
            base64,
            mimeType,
            durationMs: Date.now() - startTime,
          });
        };
        recorder.stop();
      }),
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
