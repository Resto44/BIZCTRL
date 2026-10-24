import { useClosingTranslation } from '@/lib/closing/useClosingTranslation';
import React, { forwardRef, useCallback, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { moneyInputIsValid } from '@/lib/closing/ClosingCalculations';

/**
 * Stable controlled monetary input for Sales Closing.
 *
 * The element is intentionally never keyed by its value and never reformatted
 * while editing. Consumers own the raw string state, so calculation updates in
 * sibling components cannot replace the DOM node or dismiss mobile keyboards.
 */
/**
 * @typedef {Object} ClosingNumericInputProps
 * @property {string} [id]
 * @property {string} [label]
 * @property {string | number} [value]
 * @property {(value: string) => void} [onChange]
 * @property {React.FocusEventHandler<HTMLInputElement>} [onBlur]
 * @property {string} [prefix]
 * @property {string} [helpText]
 * @property {string | boolean} [error]
 * @property {boolean} [required]
 * @property {boolean} [readOnly]
 * @property {boolean} [disabled]
 * @property {number} [min]
 * @property {number} [max]
 * @property {boolean} [allowNegative]
 * @property {string} [placeholder]
 * @property {string} [className]
 * @property {string} [inputClassName]
 * @property {string} [data-testid]
 */
const ClosingNumericInput = forwardRef(
/** @param {ClosingNumericInputProps} props @param {React.ForwardedRef<HTMLInputElement>} ref */
function ClosingNumericInput({
  id,
  label,
  value = '',
  onChange,
  onBlur,
  prefix,
  helpText,
  error,
  required = false,
  readOnly = false,
  disabled = false,
  min = 0,
  max = null,
  allowNegative = false,
  placeholder = '0.00',
  className = '',
  inputClassName = '',
  'data-testid': testId,
}, ref) {
  const closingTr = useClosingTranslation();
  const generatedId = useId();
  const inputId = id || `closing-number-${generatedId}`;
  const [editingError, setEditingError] = useState('');
  const rawValue = value == null ? '' : String(value);

  const handleChange = useCallback((event) => {
    const next = event.target.value;
    if (!moneyInputIsValid(next, { allowNegative, max })) {
      setEditingError(max != null ? 'Maximum amount is {max}.' : 'Enter a valid amount with up to two decimals.');
      return;
    }
    setEditingError('');
    onChange?.(next);
  }, [allowNegative, max, onChange]);

  const handleBlur = useCallback((event) => {
    setEditingError('');
    onBlur?.(event);
  }, [onBlur]);

  return (
    <div className={className}>
      {label && <Label htmlFor={inputId} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{closingTr(label)}{required && <span className="ml-1 text-destructive">*</span>}</Label>}
      {helpText && <p className="mb-1 text-[10px] leading-tight text-muted-foreground">{closingTr(helpText)}</p>}
      <div className="relative">
        {prefix && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-xs font-semibold tracking-wide text-muted-foreground">{prefix}</span>}
        <Input
          ref={ref}
          id={inputId}
          data-testid={testId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          value={rawValue}
          onChange={handleChange}
          onBlur={handleBlur}
          required={required}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={Boolean(error || editingError)}
          aria-describedby={helpText || error || editingError ? `${inputId}-help` : undefined}
          className={`h-10 text-left text-sm font-medium tabular-nums transition-colors ${prefix ? 'pl-14' : ''} ${readOnly ? 'cursor-default bg-muted/50 text-muted-foreground' : 'bg-background'} ${(error || editingError) ? 'border-destructive ring-1 ring-destructive/30' : ''} ${inputClassName}`}
        />
      </div>
      {(error || editingError) && <p id={`${inputId}-help`} role="alert" className="mt-1 text-[10px] font-medium text-destructive">{closingTr(error || editingError, { max })}</p>}
    </div>
  );
});

ClosingNumericInput.displayName = 'ClosingNumericInput';

export default React.memo(ClosingNumericInput);
