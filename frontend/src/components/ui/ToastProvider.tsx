import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warn' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div id="toastContainer" className="fixed bottom-8 right-6 z-[99999] flex flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast pointer-events-auto bg-white rounded-xl py-3 px-4 shadow-[0_8px_40px_rgba(30,80,30,.16)] border-l-4 text-[0.88rem] font-medium max-w-[320px] flex items-center gap-2 animate-in slide-in-from-right-8 duration-300 ${
              t.type === 'error' ? 'border-red-600' :
              t.type === 'warn' ? 'border-amber-500' :
              t.type === 'success' ? 'border-[var(--g700)]' :
              'border-blue-500'
            }`}
          >
            <span className={`material-symbols-outlined ${
              t.type === 'error' ? 'text-red-600' :
              t.type === 'warn' ? 'text-amber-500' :
              t.type === 'success' ? 'text-[var(--g700)]' :
              'text-blue-500'
            }`}>
              {t.type === 'error' ? 'cancel' :
               t.type === 'warn' ? 'warning' :
               t.type === 'success' ? 'check_circle' :
               'info'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
