/**
 * frontend/src/telegram/shop/CheckoutView.tsx
 * Full-screen checkout overlay bound to the Telegram MainButton.
 */

import { formatEtb } from './types';

export interface CheckoutFormState {
  customerName: string;
  phone: string;
  city: string;
  location: string;
  notes: string;
}

export interface CheckoutViewProps {
  form: CheckoutFormState;
  onChange: (form: CheckoutFormState) => void;
  total: number;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}

const CITIES = ['Addis Ababa', 'Other Regions', 'Abroad'];

export function CheckoutView({
  form,
  onChange,
  total,
  submitting,
  error,
  onSubmit,
}: CheckoutViewProps) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <h1 className="mb-1 font-heading text-base font-bold text-ink">Delivery Details</h1>
      <p className="mb-4 text-xs text-muted">
        Enter your details. Payment is confirmed upon delivery via Telebirr, CBE, or Cash.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="tma-name" className="mb-1 block text-xs font-semibold text-ink2">
            Full Name *
          </label>
          <input
            id="tma-name"
            type="text"
            required
            minLength={2}
            value={form.customerName}
            onChange={(event) => onChange({ ...form, customerName: event.target.value })}
            placeholder="e.g. Abebe Balcha"
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>

        <div>
          <label htmlFor="tma-checkout-phone" className="mb-1 block text-xs font-semibold text-ink2">
            Phone Number *
          </label>
          <input
            id="tma-checkout-phone"
            type="tel"
            required
            value={form.phone}
            onChange={(event) => onChange({ ...form, phone: event.target.value })}
            placeholder="+251 900 000 000"
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 font-mono text-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="tma-checkout-city" className="mb-1 block text-xs font-semibold text-ink2">
              City *
            </label>
            <select
              id="tma-checkout-city"
              value={form.city}
              onChange={(event) => onChange({ ...form, city: event.target.value })}
              className="w-full rounded-lg border border-line bg-cream px-2.5 py-2 text-xs focus:border-brand-700 focus:outline-none"
            >
              {CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-ink2">Order Type</span>
            <div className="py-2 text-xs font-medium text-ink">Direct Delivery</div>
          </div>
        </div>

        <div>
          <label htmlFor="tma-location" className="mb-1 block text-xs font-semibold text-ink2">
            Specific Delivery Area / Landmark *
          </label>
          <input
            id="tma-location"
            type="text"
            required
            minLength={2}
            value={form.location}
            onChange={(event) => onChange({ ...form, location: event.target.value })}
            placeholder="e.g. Bole, Medhanialem, next to..."
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>

        <div>
          <label htmlFor="tma-notes" className="mb-1 block text-xs font-semibold text-ink2">
            Order Notes (Optional)
          </label>
          <textarea
            id="tma-notes"
            rows={2}
            maxLength={500}
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            placeholder="Special instructions or delivery timing..."
            className="w-full rounded-lg border border-line bg-cream px-3 py-1.5 text-xs focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          />
        </div>

        <div className="space-y-1 rounded-lg border border-line bg-cream p-3 text-xs">
          <div className="flex justify-between font-semibold text-ink">
            <span>Order Total:</span>
            <span className="font-mono text-brand-900">{formatEtb(total)}</span>
          </div>
          <p className="text-xs text-muted">
            Receipt will be sent directly to your Telegram chat.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-solid py-2.5 text-xs font-semibold text-white shadow-sm hover:brightness-95 disabled:opacity-50"
        >
          {submitting ? 'Submitting Order...' : `Confirm Order — ${formatEtb(total)}`}
        </button>
      </form>
    </div>
  );
}