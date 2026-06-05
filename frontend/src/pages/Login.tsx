import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setCredentials } from '../store/slices/authSlice';
import { useToast } from '../components/ui/ToastProvider';
import axios from 'axios';

const Login: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', {
        email,
        password,
      });
      if (res.data.success) {
        dispatch(
          setCredentials({
            token: res.data.data.token,
            user: res.data.data.user,
          })
        );
        toast('Welcome back!', 'success');
        navigate('/dashboard');
      } else {
        toast(res.data.error || 'Login failed', 'error');
      }
    } 
    catch
     (err: any) {
      toast(err.response?.data?.error || 'Invalid credentials', 'error');
    } 
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#081d0b] relative overflow-hidden font-sans">
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#d5ad6d] mb-4">
            <span className="material-symbols-outlined text-[#081d0b] text-4xl">eco</span>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Staff Portal</h1>
          <p className="text-[#8ff59c] text-base mt-2 font-bold tracking-wide">Asella Organic Enterprise</p>
        </div>

        {/* Card */}
        <div className="w-full mt-4">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label htmlFor="login-email" className="block text-sm font-mono font-black uppercase tracking-widest text-[#8ff59c] mb-3 ml-1 drop-shadow-md">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="EMP-001 or Email"
                  className="w-full px-6 py-5 bg-[#0a2410]/50 backdrop-blur-md border-[3px] border-[#3e6b45] rounded-2xl text-white font-bold placeholder-[#5b9e65] text-lg focus:outline-none focus:border-[#d5ad6d] focus:ring-2 focus:ring-[#d5ad6d]/50 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-mono font-black uppercase tracking-widest text-[#8ff59c] mb-3 ml-1 drop-shadow-md">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-6 py-5 bg-[#0a2410]/50 backdrop-blur-md border-[3px] border-[#3e6b45] rounded-2xl text-white font-bold placeholder-[#5b9e65] text-lg focus:outline-none focus:border-[#d5ad6d] focus:ring-2 focus:ring-[#d5ad6d]/50 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-[#5b9e65] hover:text-[#8ff59c] transition-colors focus:outline-none flex items-center justify-center p-2 rounded-full hover:bg-[#1a4023] z-10"
                >
                  <span className="material-symbols-outlined text-[28px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[#d5ad6d] text-[#081d0b] rounded-xl font-extrabold text-lg tracking-wide hover:bg-[#e6bf7e] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                    Authenticating…
                  </>
                ) : (
                  <>
                    Access Portal
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <a href="/" className="text-sm font-bold text-[#8ff59c] hover:text-white transition-colors">
              ← Back to public site
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
