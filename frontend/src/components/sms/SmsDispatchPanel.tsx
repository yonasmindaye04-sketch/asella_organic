import React, { useState, useEffect } from 'react';
import * as t from '../affiliates/theme';
import { sms, type SmsCampaign } from '../../services/api';
import { useToast } from '../dashboard/DashboardToastProvider';
import LoadingSpinner from '../ui/LoadingSpinner';

interface Props {
  campaignId: string;
  onDispatched: () => void;
  onCancel: () => void;
}

const SmsDispatchPanel: React.FC<Props> = ({ campaignId, onDispatched, onCancel }) => {
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<SmsCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchCampaign = async () => {
      setLoading(true);
      const res = await sms.campaigns();
      if (!active) return;
      if (res.success && res.data) {
        const found = res.data.find(c => c.id === campaignId);
        if (found) {
          setCampaign(found);
        } else {
          setError('Campaign not found.');
        }
      } else {
        setError(res.error ?? 'Failed to load campaigns');
      }
      setLoading(false);
    };
    void fetchCampaign();
    return () => { active = false; };
  }, [campaignId]);

  const handleDispatch = async () => {
    if (!campaign) return;
    setError('');
    setDispatching(true);
    
    // In a real flow, you might want to show a cost override checkbox if needed,
    // but for now we default to checking if we need it
    const costOverride = campaign.estimated_cost_max > campaign.max_cost_etb;

    try {
      const res = await sms.dispatch(campaign.id, confirmPhrase, twoFaToken, costOverride);
      if (res.success) {
        showToast('Campaign successfully dispatched to the queue.', 'success');
        onDispatched();
      } else {
        setError(res.error ?? 'Dispatch failed.');
      }
    } catch (err) {
      setError('A network error occurred.');
    } finally {
      setDispatching(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!campaign) return <div className={`${t.alertError} mt-4`}>{error}</div>;

  const requiresOverride = campaign.estimated_cost_max > campaign.max_cost_etb;

  return (
    <section className={`${t.panel} ${t.panelShadow} p-5`}>
      <h2 className={t.h2}>Dispatch Confirmation</h2>
      <p className={`${t.muted} text-sm mt-1 mb-4`}>
        Review the draft details and confirm dispatch. This step requires a 2FA token.
      </p>

      <div className={`${t.panel} p-4 mb-4 grid grid-cols-2 gap-4`}>
        <div>
          <p className={`${t.label} mb-1`}>Campaign Name</p>
          <p className={t.fg}>{campaign.name}</p>
        </div>
        <div>
          <p className={`${t.label} mb-1`}>Category</p>
          <p className="capitalize">{campaign.category}</p>
        </div>
        <div>
          <p className={`${t.label} mb-1`}>Recipients</p>
          <p className={t.figure}>{campaign.recipient_count}</p>
        </div>
        <div>
          <p className={`${t.label} mb-1`}>Estimated Cost Band</p>
          <p className={`${t.figure} ${requiresOverride ? 'text-[var(--rose)] font-bold' : ''}`}>
            {campaign.estimated_cost_min} - {campaign.estimated_cost_max} ETB
          </p>
          {requiresOverride && (
            <p className="text-xs text-[var(--rose)] mt-1">
              Exceeds {campaign.max_cost_etb} ETB ceiling. Cost override will be applied.
            </p>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className={t.inputLabel}>
          Type "{campaign.name}" to confirm
          <input 
            type="text" 
            className={t.input}
            value={confirmPhrase} 
            onChange={e => setConfirmPhrase(e.target.value)} 
          />
        </label>
      </div>

      <div className="mb-4">
        <label className={t.inputLabel}>
          2FA Token (e.g. from authenticator app)
          <input 
            type="text" 
            className={t.input}
            value={twoFaToken} 
            onChange={e => setTwoFaToken(e.target.value)} 
          />
        </label>
      </div>

      {error && <div className={`${t.alertError} mt-4 mb-4`}>{error}</div>}

      <div className="flex gap-2">
        <button
          type="button"
          className={t.btnSecondary}
          onClick={onCancel}
          disabled={dispatching}
        >
          Cancel
        </button>
        <button
          type="button"
          className={t.btnPrimary}
          onClick={() => void handleDispatch()}
          disabled={dispatching || confirmPhrase !== campaign.name || !twoFaToken.trim()}
        >
          {dispatching ? 'Dispatching...' : 'Confirm and Dispatch'}
        </button>
      </div>
    </section>
  );
};

export default SmsDispatchPanel;
