import type { HabitRow as Habit } from '@/lib/database.types';
import { IconCheck } from '../icons';
import { Input } from '../ui/basics';

interface HabitRowProps {
  habit: Habit;
  booleanValue: boolean;
  numericValue: string;
  completed: boolean;
  onToggle: (next: boolean) => void;
  onNumericChange: (raw: string) => void;
}

/** Eine Gewohnheit im Tages-Check-in: großer Haken oder Zahleneingabe. */
export function HabitCheckRow({
  habit,
  booleanValue,
  numericValue,
  completed,
  onToggle,
  onNumericChange,
}: HabitRowProps) {
  if (habit.type === 'boolean') {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={booleanValue}
        onClick={() => onToggle(!booleanValue)}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
      >
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            booleanValue
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-surface-200 dark:border-surface-800'
          }`}
        >
          {booleanValue && <IconCheck size={16} strokeWidth={3} />}
        </span>
        <span
          className={`flex-1 text-base font-medium ${
            booleanValue ? 'text-surface-900/50 line-through dark:text-surface-100/50' : ''
          }`}
        >
          {habit.name}
        </span>
      </button>
    );
  }

  const target = habit.target_value ?? 0;
  const parsed = Number(numericValue.replace(',', '.'));
  const current = numericValue !== '' && !Number.isNaN(parsed) ? parsed : 0;
  const progress = target > 0 ? Math.min(1, current / target) : 0;
  const inputId = `habit-${habit.id}`;

  return (
    <div className="rounded-2xl px-3 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            completed
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-surface-200 dark:border-surface-800'
          }`}
        >
          {completed && <IconCheck size={16} strokeWidth={3} />}
        </span>
        <label htmlFor={inputId} className="flex-1 text-base font-medium">
          {habit.name}
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={numericValue}
            onChange={(e) => onNumericChange(e.target.value)}
            placeholder="0"
            className="w-24 py-2 text-right tabular-nums"
            aria-describedby={`${inputId}-target`}
          />
          <span className="text-sm text-surface-900/50 dark:text-surface-100/50">
            {habit.unit ?? ''}
          </span>
        </div>
      </div>
      <div className="ml-10 mt-2 flex items-center gap-2">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span
          id={`${inputId}-target`}
          className="text-xs tabular-nums text-surface-900/50 dark:text-surface-100/50"
        >
          Ziel {target}
          {habit.unit ? ` ${habit.unit}` : ''}
        </span>
      </div>
    </div>
  );
}
