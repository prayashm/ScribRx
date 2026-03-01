import type { Medicine } from '../schemas/prescription';

interface Props {
  index: number;
  medicine: Medicine;
  onChange: (updated: Medicine) => void;
  onRemove: () => void;
}

export function MedicineRow({ index, medicine, onChange, onRemove }: Props) {
  const update = (field: keyof Medicine, value: string) => {
    onChange({ ...medicine, [field]: value });
  };

  return (
    <div class="border border-gray-200 rounded-lg p-3 bg-white relative">
      <button
        onClick={onRemove}
        class="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-lg leading-none"
        aria-label="Remove medicine"
      >
        &times;
      </button>
      <div class="text-xs text-gray-400 mb-2 font-medium">Medicine {index + 1}</div>
      <div class="grid grid-cols-2 gap-2">
        <input
          class="col-span-2 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Medicine name"
          value={medicine.name}
          onInput={(e) => update('name', (e.target as HTMLInputElement).value)}
        />
        <input
          class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Dosage (e.g. 500mg)"
          value={medicine.dosage}
          onInput={(e) => update('dosage', (e.target as HTMLInputElement).value)}
        />
        <select
          class="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          value={medicine.frequency}
          onChange={(e) => update('frequency', (e.target as HTMLSelectElement).value)}
        >
          <option value="">Frequency</option>
          <option value="OD">OD (Once daily)</option>
          <option value="BD">BD (Twice daily)</option>
          <option value="TDS">TDS (Thrice daily)</option>
          <option value="QID">QID (Four times)</option>
          <option value="SOS">SOS (As needed)</option>
          <option value="HS">HS (At bedtime)</option>
          <option value="1-0-1">1-0-1</option>
          <option value="1-1-1">1-1-1</option>
          <option value="0-0-1">0-0-1</option>
          <option value="1-0-0">1-0-0</option>
        </select>
        <input
          class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Duration (e.g. 5 days)"
          value={medicine.duration}
          onInput={(e) => update('duration', (e.target as HTMLInputElement).value)}
        />
        <input
          class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Instructions (optional)"
          value={medicine.instructions || ''}
          onInput={(e) => update('instructions', (e.target as HTMLInputElement).value)}
        />
      </div>
    </div>
  );
}
