import type { SignatureFont, SignatureStyle } from '../lib/signature';
import { SIGNATURE_FONTS, deriveSignatureText } from '../lib/signature';

interface Props {
  fullName: string;
  font: SignatureFont;
  style: SignatureStyle;
}

export function SignaturePreview({ fullName, font, style }: Props) {
  const text = deriveSignatureText(fullName || 'Your Name', style);

  return (
    <div class="flex justify-center p-4 bg-gray-50 rounded-lg">
      <span
        style={{ fontFamily: `"${font}", cursive`, fontSize: '28px', color: '#1e3a5f' }}
      >
        {text}
      </span>
    </div>
  );
}

interface SelectorProps {
  selectedFont: SignatureFont;
  selectedStyle: SignatureStyle;
  onFontChange: (font: SignatureFont) => void;
  onStyleChange: (style: SignatureStyle) => void;
  fullName: string;
}

export function SignatureSelector({ selectedFont, selectedStyle, onFontChange, onStyleChange, fullName }: SelectorProps) {
  return (
    <div class="space-y-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-2">Signature Font</label>
        <div class="grid grid-cols-2 gap-2">
          {SIGNATURE_FONTS.map((font) => (
            <button
              key={font}
              onClick={() => onFontChange(font)}
              class={`p-2 rounded-lg border text-center text-lg transition-colors ${
                selectedFont === font
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
              style={{ fontFamily: `"${font}", cursive` }}
            >
              {deriveSignatureText(fullName || 'Name', selectedStyle)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-2">Signature Style</label>
        <div class="flex gap-2">
          {([['initials', 'Initials'], ['lastName', 'Last Name'], ['fullName', 'Full Name']] as const).map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() => onStyleChange(value)}
                class={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  selectedStyle === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
