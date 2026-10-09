import React, { useState } from 'react';
import * as t from './theme';

interface Props {
  open: boolean;
  title: string;
  description: string;
  /** When set, the user must type this exact text to enable the confirm button. */
  confirmPhrase?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  /** Receives the 2FA code the user typed, to be sent as the x-2fa-token header. */
  onConfirm: (twoFaToken: string) => void;
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
    onConfirm(twoFaToken.trim());
    setTyped('');
    setTwoFaToken('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--fg)]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--sh2)]`}>
        <h3 className={`${t.h2} text-base ${danger ? 'text-[var(--rose)]' : t.fg}`}>
          {title}
        </h3>
        <p className={`mt-2 text-sm leading-relaxed ${t.fgSecondary}`}>{description}</p>

        {confirmPhrase && (
          <div className="mt-4">
            <label className={`text-xs font-bold ${t.fgSecondary}`}>
              Type <span className={`font-mono text-[var(--rose)]`}>{confirmPhrase}</span> to confirm
              <input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoComplete="off"
                className={`mt-1 w-full rounded-md border-[1.5px] border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)]`}
              />
            </label>
          </div>
        )}

        <div className="mt-4">
          <label className={`text-xs font-bold ${t.fgSecondary}`}>
            2FA code
            <input
              value={twoFaToken}
              onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code from your authenticator"
              className={`mt-1 ${t.input}`}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={close}
            disabled={busy}
            className={`${t.btnBase} border-[1.5px] border-[var(--border)] px-4 py-2 text-sm text-[var(--fg-secondary)] hover:border-[var(--border-light)] hover:text-[var(--fg)] disabled:opacity-40`}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              danger ? 'bg-[var(--rose)] hover:brightness-95' : 'bg-[var(--accent)] hover:bg-[var(--g800)]'
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
