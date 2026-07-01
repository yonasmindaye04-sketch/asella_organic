import React, { useState, useEffect } from 'react';
import { api, auth, staff } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

const ChangePasswordPage: React.FC = () => {
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA State
  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState('');
  const [twoFaMessage, setTwoFaMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [adminPasswordReset, setAdminPasswordReset] = useState({ new: '', confirm: '' });
  const [adminMessage, setAdminMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    // Check 2FA status and admin status on mount
    const fetchStatus = async () => {
      const res = await auth.me();
      if (res.success && res.data) {
        setTwoFaEnabled(res.data.two_factor_enabled);
        if (res.data.role === 'admin' || res.data.role === 'manager' || res.data.role === 'owner') {
          setIsAdmin(true);
          const staffRes = await api.get<any[]>('/api/staff');
          if (staffRes.success) setUsers(staffRes.data || []);
        }
      }
    };
    fetchStatus();
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    
    try {
      setLoading(true);
      const res = await api.patch('/api/auth/change-password', {
        current_password: passwords.current,
        new_password: passwords.new
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Password changed successfully.' });
        setPasswords({ current: '', new: '', confirm: '' });
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to change password.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Network error.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSetup2FA = async () => {
    setTwoFaLoading(true);
    setTwoFaMessage(null);
    try {
      const res = await staff.setup2FA() as any;
      if (res.success && res.data) {
        setQrCode(res.data.qr_code);
        setManualKey(res.data.manual_entry_key);
      } else {
        setTwoFaMessage({ type: 'error', text: res.error || 'Failed to initiate 2FA setup.' });
      }
    } catch (err: any) {
      setTwoFaMessage({ type: 'error', text: err.message || 'Network error.' });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyToken) return;
    setTwoFaLoading(true);
    try {
      const res = await staff.verify2FA(verifyToken);
      if (res.success) {
        setTwoFaEnabled(true);
        setQrCode(null);
        setManualKey(null);
        setVerifyToken('');
        setTwoFaMessage({ type: 'success', text: 'Two-Factor Authentication enabled successfully!' });
      } else {
        setTwoFaMessage({ type: 'error', text: res.error || 'Invalid verification code.' });
      }
    } catch (err: any) {
      setTwoFaMessage({ type: 'error', text: err.message || 'Network error.' });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyToken) {
      setTwoFaMessage({ type: 'error', text: 'Please enter a 2FA code to disable.' });
      return;
    }
    setTwoFaLoading(true);
    try {
      const res = await staff.disable2FA(verifyToken);
      if (res.success) {
        setTwoFaEnabled(false);
        setVerifyToken('');
        setTwoFaMessage({ type: 'success', text: 'Two-Factor Authentication disabled successfully.' });
      } else {
        setTwoFaMessage({ type: 'error', text: res.error || 'Invalid 2FA code. Cannot disable.' });
      }
    } catch (err: any) {
      setTwoFaMessage({ type: 'error', text: err.message || 'Network error.' });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleAdminResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      setAdminMessage({ type: 'error', text: 'Please select an employee.' });
      return;
    }
    if (adminPasswordReset.new !== adminPasswordReset.confirm) {
      setAdminMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    try {
      setAdminLoading(true);
      const res = await api.put(`/api/staff/${selectedUser}/password`, { password: adminPasswordReset.new });
      if (res.success) {
        setAdminMessage({ type: 'success', text: 'Employee password reset successfully.' });
        setAdminPasswordReset({ new: '', confirm: '' });
        setSelectedUser('');
      } else {
        setAdminMessage({ type: 'error', text: res.error || 'Failed to reset password.' });
      }
    } catch (err: any) {
      setAdminMessage({ type: 'error', text: err.message || 'Network error.' });
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-12 space-y-8">
        
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#112415]">Security Settings</h1>
          <p className="text-gray-500 mt-2">Manage your password and two-factor authentication.</p>
        </div>

        {/* Change Password Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-8 py-5 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
            <span className="material-symbols-outlined text-gray-500">lock</span>
            <h2 className="text-lg font-bold text-[#112415]">Change Password</h2>
          </div>

          {message && (
            <div className={`mx-8 mt-6 p-4 rounded-lg text-sm font-bold ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="p-8">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Current Password</label>
                <input required type="password" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">New Password</label>
                <input required type="password" value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
                <input required type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full mt-8 py-3 bg-[#112415] text-white rounded-xl font-bold hover:bg-[#1a3821] transition flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Two-Factor Authentication Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-8 py-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-gray-500">security</span>
              <h2 className="text-lg font-bold text-[#112415]">Two-Factor Authentication (2FA)</h2>
            </div>
            {twoFaEnabled !== null && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${twoFaEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                {twoFaEnabled ? 'Enabled' : 'Disabled'}
              </span>
            )}
          </div>

          <div className="p-8">
            {twoFaMessage && (
              <div className={`mb-6 p-4 rounded-lg text-sm font-bold ${twoFaMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {twoFaMessage.text}
              </div>
            )}

            {twoFaEnabled === null ? (
              <div className="text-gray-400 text-sm">Loading 2FA status...</div>
            ) : twoFaEnabled ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Your account is currently protected by 2FA. You will be prompted for a 6-digit code when performing sensitive actions (like deleting products).</p>
                <form onSubmit={handleDisable2FA} className="bg-red-50 p-6 rounded-xl border border-red-100 space-y-4">
                  <h3 className="font-bold text-red-800">Disable 2FA</h3>
                  <p className="text-xs text-red-600">To disable Two-Factor Authentication, please enter your current 6-digit code from Google Authenticator.</p>
                  <input required type="text" maxLength={6} placeholder="000000" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} className="w-full max-w-xs px-4 py-3 rounded-lg border border-red-200 focus:border-red-500 outline-none transition text-center text-lg font-mono tracking-widest" />
                  <button type="submit" disabled={twoFaLoading || !verifyToken} className="block px-6 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition disabled:opacity-50">
                    {twoFaLoading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </form>
              </div>
            ) : (
              <div>
                {!qrCode ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Protect your account with Two-Factor Authentication. Once enabled, you will use Google Authenticator (or a similar app) to generate 6-digit codes for sensitive actions.</p>
                    <button onClick={handleSetup2FA} disabled={twoFaLoading} className="px-6 py-3 bg-[#4ade80] text-[#112415] rounded-xl font-bold hover:bg-[#3bca6d] transition disabled:opacity-50 flex items-center gap-2">
                      <span className="material-symbols-outlined">qr_code_scanner</span>
                      {twoFaLoading ? 'Generating...' : 'Setup Google Authenticator'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <p className="text-sm text-gray-600 font-medium">1. Scan this QR code with the Google Authenticator app:</p>
                    <div className="bg-gray-50 p-4 inline-block rounded-xl border border-gray-200">
                      <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                    </div>
                    {manualKey && (
                      <p className="text-xs text-gray-500">Or enter this key manually: <strong className="font-mono bg-gray-100 px-2 py-1 rounded">{manualKey}</strong></p>
                    )}
                    
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-sm text-gray-600 font-medium mb-3">2. Enter the 6-digit code generated by your app to verify and enable 2FA:</p>
                      <form onSubmit={handleVerify2FA} className="flex items-center gap-3">
                        <input required type="text" maxLength={6} placeholder="000000" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} className="w-32 px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition text-center text-lg font-mono tracking-widest" />
                        <button type="submit" disabled={twoFaLoading || !verifyToken} className="px-6 py-3 bg-[#112415] text-white rounded-lg font-bold hover:bg-[#1a3821] transition disabled:opacity-50">
                          {twoFaLoading ? 'Verifying...' : 'Verify & Enable'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Reset Employee Password Section (Admin Only) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
              <span className="material-symbols-outlined text-gray-500">manage_accounts</span>
              <h2 className="text-lg font-bold text-[#112415]">Reset Employee Password</h2>
            </div>

            {adminMessage && (
              <div className={`mx-8 mt-6 p-4 rounded-lg text-sm font-bold ${adminMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {adminMessage.text}
              </div>
            )}

            <form onSubmit={handleAdminResetSubmit} className="p-8">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Select Employee</label>
                  <select required value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition bg-white">
                    <option value="">-- Choose an employee --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">New Password</label>
                  <input required type="password" value={adminPasswordReset.new} onChange={e => setAdminPasswordReset({...adminPasswordReset, new: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
                  <input required type="password" value={adminPasswordReset.confirm} onChange={e => setAdminPasswordReset({...adminPasswordReset, confirm: e.target.value})} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition" />
                </div>
              </div>

              <button type="submit" disabled={adminLoading} className="w-full mt-8 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-50">
                {adminLoading ? 'Resetting...' : 'Reset Employee Password'}
              </button>
            </form>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default ChangePasswordPage;

