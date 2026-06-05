import React, { useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../layouts/DashboardLayout';

const ChangePasswordPage: React.FC = () => {
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    
    try {
      setLoading(true);
      const res = await axios.patch('/api/auth/change-password', {
        current_password: passwords.current,
        new_password: passwords.new
      });
      if (res.data.success) {
        setMessage({ type: 'success', text: 'Password changed successfully.' });
        setPasswords({ current: '', new: '', confirm: '' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to change password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-200 bg-gray-50 text-center">
            <div className="w-16 h-16 rounded-full bg-[#e8f5e9] text-[#112415] flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">lock</span>
            </div>
            <h1 className="text-2xl font-bold text-[#112415]">Change Password</h1>
            <p className="text-sm text-gray-500 mt-1">Update your account credentials securely.</p>
          </div>

          {message && (
            <div className={`mx-8 mt-6 p-4 rounded-lg text-sm font-bold ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8">
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
      </div>
    </DashboardLayout>
  );
};

export default ChangePasswordPage;
