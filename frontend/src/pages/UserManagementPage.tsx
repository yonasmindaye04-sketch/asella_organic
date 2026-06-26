import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

interface User {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: string;
  active: boolean;
}

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'staff',
    phone: ''
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get<User[]>('/api/staff');
      if (res.success) {
        setUsers(res.data || []);
      } else {
        setError(res.error || 'Failed to fetch users');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        password: '',
        full_name: user.full_name,
        email: user.email || '',
        role: user.role,
        phone: ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        full_name: '',
        email: '',
        role: 'staff',
        phone: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let res;
      if (editingUser) {
        res = await api.patch(`/api/staff/${editingUser.id}`, formData);
      } else {
        res = await api.post('/api/staff', formData);
      }
      
      if (res.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(res.error || 'Failed to save user');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        const res = await api.delete(`/api/staff/${id}`);
        if (res.success) {
          fetchUsers();
        } else {
          alert(res.error || 'Failed to delete user');
        }
      } catch (err: any) {
        alert(err.message || 'Network error');
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#112415]">User Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage staff access and roles.</p>
          </div>
          <button onClick={() => handleOpenModal()} className="bg-[#112415] hover:bg-[#1a3821] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition flex items-center gap-2 shadow-md">
            <span className="material-symbols-outlined text-[18px]">person_add</span> Add User
          </button>
        </div>

        {error && <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Username</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8">No users found.</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 transition ${!u.active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 font-bold text-[#112415] text-sm">{u.full_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{u.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                    <td className="px-6 py-4"><span className="px-3 py-1 bg-[#e8f5e9] text-[#112415] text-[10px] font-bold uppercase tracking-wider rounded-full">
                      {u.role}</span></td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleOpenModal(u)} className="text-gray-400 hover:text-[#4ade80] transition px-2">
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="text-gray-400 hover:text-red-500 transition px-2">
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editingUser ? 'Edit User' : 'Add User'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                <input required type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Username</label>
                <input required type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Role</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
                  <input required={!editingUser} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-bold text-gray-500">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#112415] text-white rounded-lg font-bold">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default UserManagementPage;
