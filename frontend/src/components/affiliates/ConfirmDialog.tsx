import React, { useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  description: string;
  /** When set, the user must type this exact text to enable the confirm button. */
  confirmPhrase?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for irreversible actions.
 *
 * Used for affiliate deletion and manual commission reversal — both of which
 * change money or remove records. When `confirmPhrase` is supplied the user
 * must type it exactly, which prevents an accidental click from deleting an
 * affiliate. 2FA is collected by the caller and sent as a request header.
 */
const ConfirmDialog: React.FC<Props> = ({
  open,
  title,
  description,
  confirmPhrase,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');

  if (!open) return null;

  const phraseOk = !confirmPhrase || typed.trim() === confirmPhrase;
  const canConfirm = phraseOk && twoFaToken.trim().length > 0 && !busy;

  const close = () => {
    setTyped('');
    setTwoFaToken('');
    onCancel();
  };

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm();
    setTyped('');
    setTwoFaToken('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className={`text-base font-black ${danger ? 'text-red-700' : 'text-slate-900'}`}>
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>

        {confirmPhrase && (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-600">
              Type <span className="font-mono text-red-700">{confirmPhrase}</span> to confirm
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </label>
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs font-bold text-slate-600">
            2FA code
            <input
              value={twoFaToken}
              onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code from your authenticator"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={close}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#2e7d32] hover:bg-[#1b3d1e]'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
