import React, { createContext, useContext, useState, useCallback } from "react";

type ToastType = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const typeStyles: Record<ToastType, string> = {
  info: "border-[var(--sky)] bg-[var(--sky-dim)]",
  success: "border-[var(--emerald)] bg-[var(--emerald-dim)]",
  warning: "border-[var(--accent)] bg-[var(--accent-dim)]",
  error: "border-[var(--rose)] bg-[var(--rose-dim)]",
};

const typeIcons: Record<ToastType, string> = {
  info: "fa-circle-info",
  success: "fa-circle-check",
  warning: "fa-triangle-exclamation",
  error: "fa-circle-xmark",
};

const typeIconColors: Record<ToastType, string> = {
  info: "var(--sky)",
  success: "var(--emerald)",
  warning: "var(--accent)",
  error: "var(--rose)",
};

let toastId = 0;

export function DashboardToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 350);
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl text-[12px] font-medium text-[var(--fg)] shadow-2xl ${
              typeStyles[toast.type]
            } ${
              toast.exiting
                ? "animate-[slideOutRight_0.35s_ease-in_forwards]"
                : "animate-[slideInRight_0.3s_ease-out_forwards]"
            }`}
          >
            <i className={`fa-solid ${typeIcons[toast.type]} text-[13px]`} style={{ color: typeIconColors[toast.type] }} />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
