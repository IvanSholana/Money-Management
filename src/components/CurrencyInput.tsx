type CurrencyInputProps = {
  value: number | string;
  onValueChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
  title?: string;
};

export function parseCurrencyInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function formatCurrencyInput(value: number | string): string {
  const numericValue = typeof value === "number" ? value : parseCurrencyInput(value);
  if (!numericValue) return "";
  return `Rp ${new Intl.NumberFormat("id-ID").format(numericValue)}`;
}

export function CurrencyInput({
  value,
  onValueChange,
  className,
  disabled = false,
  placeholder = "Rp 0",
  required = false,
  title,
}: CurrencyInputProps) {
  return (
    <input
      className={className}
      disabled={disabled}
      inputMode="numeric"
      min={0}
      placeholder={placeholder}
      required={required}
      title={title}
      type="text"
      value={formatCurrencyInput(value)}
      onChange={(event) => onValueChange(parseCurrencyInput(event.target.value))}
    />
  );
}
