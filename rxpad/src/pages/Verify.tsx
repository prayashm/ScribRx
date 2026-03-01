import { useMemo } from 'preact/hooks';

interface VerifyProps {
  path?: string;
  data?: string;
}

export function Verify({ data }: VerifyProps) {
  const payload = useMemo(() => {
    if (!data) return null;
    try {
      return JSON.parse(atob(decodeURIComponent(data)));
    } catch {
      return null;
    }
  }, [data]);

  if (!payload) {
    return (
      <div class="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div class="bg-white rounded-xl border p-6 max-w-sm w-full text-center">
          <div class="text-4xl mb-3">&#9888;</div>
          <h1 class="text-lg font-semibold text-gray-900 mb-2">Invalid Verification Link</h1>
          <p class="text-sm text-gray-600">This QR code does not contain valid prescription data.</p>
        </div>
      </div>
    );
  }

  const isCancelled = payload.status === 'cancelled';

  return (
    <div class="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div class="bg-white rounded-xl border p-6 max-w-sm w-full">
        <div class="text-center mb-4">
          <div class="text-4xl mb-2">{isCancelled ? '\uD83D\uDEAB' : '\u2705'}</div>
          <h1 class="text-lg font-semibold text-gray-900">
            {isCancelled ? 'Cancelled Prescription' : 'Valid Prescription'}
          </h1>
        </div>

        <div class="space-y-3 text-sm">
          <div class="flex justify-between py-2 border-b">
            <span class="text-gray-500">Prescription ID</span>
            <span class="font-medium">{payload.rxId}</span>
          </div>
          <div class="flex justify-between py-2 border-b">
            <span class="text-gray-500">Doctor</span>
            <span class="font-medium">{payload.doctorName}</span>
          </div>
          <div class="flex justify-between py-2 border-b">
            <span class="text-gray-500">Registration No.</span>
            <span class="font-medium">{payload.regNo}</span>
          </div>
          <div class="flex justify-between py-2 border-b">
            <span class="text-gray-500">Date</span>
            <span class="font-medium">
              {new Date(payload.date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          <div class="flex justify-between py-2 border-b">
            <span class="text-gray-500">Patient</span>
            <span class="font-medium">{payload.patientInitials}</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-gray-500">Status</span>
            <span
              class={`font-medium px-2 py-0.5 rounded-full text-xs ${
                isCancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {isCancelled ? 'CANCELLED' : 'VALID'}
            </span>
          </div>
        </div>

        <p class="text-xs text-gray-400 mt-4 text-center">
          Verified by RxPad — Prescription Generation System
        </p>
      </div>
    </div>
  );
}
