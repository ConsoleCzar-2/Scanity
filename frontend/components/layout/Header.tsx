'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Menu,
  Sparkles,
  User,
  LogOut,
  ChevronDown,
  Shield,
  UserCheck,
} from 'lucide-react';
import {
  APP_NAME,
  APP_VERSION,
} from '@/lib/constants';
import { UserProfile } from '@/lib/auth';

interface HeaderProps {
  onToggleDrawer: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  user: UserProfile | null;
}

export function Header({
  onToggleDrawer,
  onOpenProfile,
  onSignOut,
  user,
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <header className="sticky top-0 z-40 border-b border-[#1c232f] bg-[#090b0e] h-13 flex items-center">
      <div className="w-full px-4 sm:px-6 flex items-center justify-between">
        {/* Extreme Left: Drawer Hamburger & Brand Link to Home */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleDrawer}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#161c26] transition-colors cursor-pointer"
            title="Open navigation drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 group transition-opacity hover:opacity-90 cursor-pointer"
            title="Return to Scanity Overview"
          >
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight">{APP_NAME}</span>
            <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-[#161c26] text-slate-400 border border-[#222b3a]">
              {APP_VERSION}
            </span>
          </Link>
        </div>

        {/* Extreme Right: User Account Avatar & Dropdown Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 rounded hover:bg-[#161c26] transition-colors border border-transparent hover:border-[#222b3a] cursor-pointer"
            title="User Profile & Settings"
          >
            <div className="w-7 h-7 rounded bg-[#161c26] border border-[#222b3a] flex items-center justify-center text-xs font-semibold text-slate-300">
              {isAdmin ? (
                <Shield className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <User className="w-3.5 h-3.5 text-slate-300" />
              )}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-medium text-slate-200 leading-tight">
                {user?.name || 'User'}
              </span>
              <span className="text-[9px] font-mono text-slate-400 uppercase">
                {user?.role || 'Guest'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-[#11151c] border border-[#1c232f] rounded shadow-xl py-1 z-50 text-xs flex flex-col">
              <div className="px-3 py-2 border-b border-[#1c232f]">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-slate-200 truncate">{user?.name || 'User'}</p>
                  <span
                    className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-semibold ${
                      isAdmin
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                        : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60'
                    }`}
                  >
                    {isAdmin ? 'Admin' : 'Customer'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {user?.email || 'user@scanity.ai'}
                </p>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onOpenProfile();
                }}
                className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-[#161c26] hover:text-white transition-colors text-left cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Profile Details</span>
              </button>

              <div className="border-t border-[#1c232f] mt-1 pt-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-[#161c26] transition-colors text-left cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
