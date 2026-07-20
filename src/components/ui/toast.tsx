import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface Toast {
  id: number;
  message: string;
  variant: 'info' | 'success' | 'error';
}

interface ToastContextValue {
  showToast: (message: string, variant?: Toast['variant']) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback(
    (message: string, variant: Toast['variant'] = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ top: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`animate-fade-up w-full max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.variant === 'success'
                ? 'bg-brand-600 text-white'
                : toast.variant === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast muss innerhalb von ToastProvider verwendet werden');
  return ctx;
}
