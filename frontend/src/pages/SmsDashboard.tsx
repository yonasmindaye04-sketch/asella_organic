import React, { useState } from 'react';
import SmsComposerPanel from '../components/sms/SmsComposerPanel';
import SmsDispatchPanel from '../components/sms/SmsDispatchPanel';
import DashboardLayout from '../layouts/DashboardLayout';

const SmsDashboard: React.FC = () => {
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-[#f7faf7] font-sans overflow-hidden">
        {/* Dark Green Header */}
        <header className="flex items-center justify-between px-5 py-3 bg-[#1b3d1e] shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#2e7d32] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[16px]">sms</span>
            </div>
            <h1 className="text-white font-black text-[15px] tracking-wide">Asella — SMS Campaigns</h1>
            <span className="text-white/50 text-[11px] font-mono ml-2 hidden sm:inline">Compose and dispatch SMS broadcasts</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {!draftCampaignId ? (
              <SmsComposerPanel onDraftCreated={(id) => setDraftCampaignId(id)} />
            ) : (
              <SmsDispatchPanel
                campaignId={draftCampaignId}
                onDispatched={() => setDraftCampaignId(null)}
                onCancel={() => setDraftCampaignId(null)}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SmsDashboard;

