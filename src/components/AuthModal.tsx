import React, { useState } from 'react';
import { X, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await signup({ email, password, name });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login({ email: 'alex@example.com', password: 'password123' });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="max-w-sm w-full rounded-xl border border-white/10 bg-[#121520] p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-5">
          <h3 className="text-base font-semibold text-white">
            {mode === 'login' ? 'Sign In to Account' : 'Create an Account'}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Associate your active mailbox with your account to access it across devices.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2.5 mb-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {mode === 'signup' && (
            <div>
              <label className="block text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Alex"
                className="w-full bg-zinc-900 border border-white/10 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="alex@example.com"
              className="w-full bg-zinc-900 border border-white/10 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-500"
              required
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-zinc-900 border border-white/10 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md font-medium text-xs bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer mt-1"
          >
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-white/[0.06] text-center text-xs text-zinc-400">
          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-1.5 px-3 rounded-md text-[11px] font-medium text-zinc-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors mb-2.5"
          >
            Demo Sign-In (alex@example.com)
          </button>

          {mode === 'login' ? (
            <span>
              Don't have an account?{' '}
              <button
                onClick={() => setMode('signup')}
                className="text-white hover:underline font-medium"
              >
                Sign up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="text-white hover:underline font-medium"
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
