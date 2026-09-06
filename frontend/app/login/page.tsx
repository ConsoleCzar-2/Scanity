'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ShieldCheck, UserCheck, AlertCircle } from 'lucide-react';
import { login, registerCustomer, getCurrentUser } from '@/lib/auth';
import { APP_NAME, APP_VERSION } from '@/lib/constants';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already logged in, redirect straight to /chat
    const user = getCurrentUser();
    if (user) {
      router.push('/chat');
    }
  }, [router]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = login(email, password);
    if (!res.success) {
      setError(res.error || 'Login failed');
      setLoading(false);
      return;
    }

    router.push('/chat');
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = registerCustomer(name, email, password);
    if (!res.success) {
      setError(res.error || 'Registration failed');
      setLoading(false);
      return;
    }

    router.push('/chat');
  };

  const fillQuickCredentials = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setLoading(true);

    const res = login(demoEmail, demoPass);
    if (res.success) {
      router.push('/chat');
    } else {
      setError(res.error || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090b0e] text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans">
      {/* Top Bar with brand link back to home */}
      <header className="w-full flex items-center justify-between pb-6">
        <Link
          href="/"
          className="flex items-center gap-2 group text-white hover:text-slate-200 transition-colors"
        >
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-base tracking-tight">{APP_NAME}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161c26] text-slate-400 border border-[#1c232f]">
            {APP_VERSION}
          </span>
        </Link>

        <Link
          href="/"
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Back to Overview
        </Link>
      </header>

      {/* Main Login Card */}
      <main className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-lg bg-[#11151c] border border-[#1c232f] p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold tracking-tight text-white mb-1.5">
              {tab === 'signin' ? 'Access Workspace' : 'Create Customer Account'}
            </h1>
            <p className="text-xs text-slate-400">
              {tab === 'signin'
                ? 'Sign in to access grounded RAG intelligence and verified documents.'
                : 'Register as a verified customer. Admin privileges require manual provisioning.'}
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded bg-[#090b0e] border border-[#1c232f] mb-6">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setError(null);
              }}
              className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'signin'
                  ? 'bg-[#161c26] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'register'
                  ? 'bg-[#161c26] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register
            </button>
          </div>

          {/* Quick Demo Credentials (Sign In mode only) */}
          {tab === 'signin' && (
            <div className="mb-6 p-3 rounded bg-[#090b0e] border border-[#1c232f]">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                Instant Demo Access
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillQuickCredentials('admin@scanity.ai', 'admin123')}
                  className="px-2.5 py-1.5 rounded bg-[#161c26] hover:bg-[#1f2736] border border-[#232c3d] text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    admin@scanity.ai
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fillQuickCredentials('user@scanity.ai', 'user123')}
                  className="px-2.5 py-1.5 rounded bg-[#161c26] hover:bg-[#1f2736] border border-[#232c3d] text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-300">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Customer</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    user@scanity.ai
                  </div>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@scanity.ai"
                  className="w-full px-3 py-2 rounded bg-[#090b0e] border border-[#1c232f] focus:border-indigo-500 text-white text-xs outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded bg-[#090b0e] border border-[#1c232f] focus:border-indigo-500 text-white text-xs outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded bg-white hover:bg-slate-200 text-slate-950 font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 mt-2"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3 py-2 rounded bg-[#090b0e] border border-[#1c232f] focus:border-indigo-500 text-white text-xs outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  className="w-full px-3 py-2 rounded bg-[#090b0e] border border-[#1c232f] focus:border-indigo-500 text-white text-xs outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2 rounded bg-[#090b0e] border border-[#1c232f] focus:border-indigo-500 text-white text-xs outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full px-3 py-2 rounded bg-[#090b0e] border border-[#1c232f] focus:border-indigo-500 text-white text-xs outline-none transition-colors"
                />
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed px-1">
                Notice: Accounts registered here are granted Customer access. Administrator privileges cannot be self-provisioned.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded bg-white hover:bg-slate-200 text-slate-950 font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 mt-2"
              >
                <span>{loading ? 'Creating Account...' : 'Create Customer Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="w-full text-center text-xs text-slate-400 py-4 font-mono">
        Scanity • RAG Architecture
      </footer>
    </div>
  );
}
