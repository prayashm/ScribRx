import type { Prescription } from '../schemas/prescription';

interface Props {
  rx: Prescription;
  onClick: () => void;
}

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  finalized: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800 line-through',
};

export function PrescriptionCard({ rx, onClick }: Props) {
  const date = new Date(rx.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <button
      onClick={onClick}
      class="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors"
    >
      <div class="flex items-center justify-between mb-1">
        <span class="font-medium text-gray-900">{rx.patient.name}</span>
        <span class={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[rx.status]}`}>
          {rx.status}
        </span>
      </div>
      <div class="flex items-center gap-3 text-xs text-gray-500">
        <span>{date}</span>
        <span>{rx.id}</span>
        <span>{rx.medicines.length} medicine{rx.medicines.length !== 1 ? 's' : ''}</span>
      </div>
    </button>
  );
}
