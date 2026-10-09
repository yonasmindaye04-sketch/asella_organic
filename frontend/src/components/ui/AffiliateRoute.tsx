import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Link } from 'react-router-dom';
import type { RootState } from '../../store';

interface Props {
  children: React.ReactNode;
}

/**
 * Guard for the affiliate portal.
 *
 * Deliberately separate from ProtectedRoute: an affiliate must never be able
 * to render dashboard pages, and staff must never be able to render the
 * portal. Each group is redirected to its own surface.
 *
 * This is a UX-level gate only. The real enforcement is server-side — the
 * portal API accepts role 'affiliate' exclusively and resolves scope from the
 * JWT subject, so bypassing this component grants nothing.
 */
const AffiliateRoute: React.FC<Props> = ({ children }) => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'affiliate') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AffiliateRoute;

/** Shown to staff who land on /affiliate — points them at the real thing.
 *  Uses the same brand tokens as AffiliateDashboard's dark chrome so the two
 *  read as one surface. */
export const AffiliateOnlyNotice: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-[var(--g900)] px-6">
    <div className="w-full max-w-md rounded-2xl border-2 border-[var(--g600)] bg-[var(--g800)] p-8 text-center">
      <h1 className="text-2xl font-bold text-white">Affiliate area</h1>
      <p className="mt-2 text-sm text-[var(--g200)]">
        You are signed in with a staff account. The affiliate portal shows only that person's
        own commissions and referrals.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-block rounded-lg bg-[var(--highland-gold-light)] px-6 py-3 font-extrabold text-[var(--g900)]"
      >
        Back to dashboard
      </Link>
    </div>
  </div>
);
