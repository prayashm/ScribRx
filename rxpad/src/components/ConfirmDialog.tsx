interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive,
}: Props) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div class="bg-white rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl" onClick={(e: Event) => e.stopPropagation()}>
        <h3 class="text-lg font-semibold text-gray-900">{title}</h3>
        <p class="mt-2 text-sm text-gray-600">{message}</p>
        <div class="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            class={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
