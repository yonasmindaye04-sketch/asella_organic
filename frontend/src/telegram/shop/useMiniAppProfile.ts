/**
 * frontend/src/telegram/shop/useMiniAppProfile.ts
 * Loads and persists the Account tab profile against the Telegram Mini App
 * profile endpoints.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchProfile, updateProfile } from './api';
import type { ProfileResponse, ProfileUpdate } from './types';

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

export interface UseMiniAppProfileReturn {
  data: ProfileResponse | null;
  status: ProfileStatus;
  error: string | null;
  reload: () => Promise<void>;
  save: (payload: ProfileUpdate) => Promise<boolean>;
}

export function useMiniAppProfile(initData: string): UseMiniAppProfileReturn {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState<ProfileStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!initData) {
      setStatus('error');
      setError('Open the store from Telegram to load your profile.');
      return;
    }

    setStatus((prev) => (prev === 'ready' ? prev : 'loading'));
    setError(null);

    try {
      const profile = await fetchProfile(initData);
      setData(profile);
      setStatus('ready');
    } catch (err: any) {
      setError(err?.message || 'Unable to load your profile.');
      setStatus('error');
    }
  }, [initData]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (payload: ProfileUpdate) => {
      setStatus('saving');
      setError(null);

      try {
        const result = await updateProfile(initData, payload);
        setData((prev) =>
          prev
            ? { ...prev, profile: { ...prev.profile, ...result.profile } }
            : prev
        );
        setStatus('ready');
        return true;
      } catch (err: any) {
        setError(err?.message || 'Unable to save your profile.');
        setStatus('error');
        return false;
      }
    },
    [initData]
  );

  return { data, status, error, reload, save };
}