'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Mail, Shield, Check } from 'lucide-react';
import { getCurrentUser, updateUserProfile, UserProfile } from '@/lib/auth';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}

function ProfileModalContent({
  onClose,
  onProfileUpdated,
}: {
  onClose: () => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUser());
  const [name, setName] = useState(() => getCurrentUser()?.name || '');
  const [email, setEmail] = useState(() => getCurrentUser()?.email || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!currentUser) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = updateUserProfile({ name, email });
    if (updated) {
      setCurrentUser(updated);
      if (onProfileUpdated) onProfileUpdated(updated);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 700);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#11151c] border border-[#1c232f] rounded-lg shadow-2xl p-6 flex flex-col gap-5 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1c232f] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#161c26] border border-[#222b3a] flex items-center justify-center text-slate-300">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Profile Details</h3>
              <p className="text-[11px] text-slate-400 font-mono">Manage workspace identity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#161c26] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3 py-2 text-xs bg-[#161c26] border border-[#222b3a] rounded text-slate-200 focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-3 py-2 text-xs bg-[#161c26] border border-[#222b3a] rounded text-slate-200 focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              Account Role
            </label>
            <div className="px-3 py-2 text-xs bg-[#090b0e] border border-[#1c232f] rounded flex items-center justify-between">
              <span className="capitalize font-mono text-slate-300">{currentUser.role}</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                  currentUser.role === 'admin'
                    ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                    : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60'
                }`}
              >
                {currentUser.role === 'admin' ? 'Full Administrator' : 'Standard Customer'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c232f]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded border border-[#222b3a] hover:bg-[#161c26] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium rounded bg-white hover:bg-slate-200 text-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Saved
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProfileModal({ isOpen, onClose, onProfileUpdated }: ProfileModalProps) {
  if (!isOpen) return null;
  return <ProfileModalContent onClose={onClose} onProfileUpdated={onProfileUpdated} />;
}
