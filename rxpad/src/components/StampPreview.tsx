interface Props {
  base64: string;
}

export function StampPreview({ base64 }: Props) {
  return (
    <div class="flex justify-center p-4">
      <img src={base64} alt="Doctor stamp preview" class="w-32 h-32 opacity-80" />
    </div>
  );
}
