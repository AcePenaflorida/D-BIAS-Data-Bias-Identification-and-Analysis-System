import { useState } from 'react';
import Logo from '../assets/logo-d-bias.svg';
import { AuthActions } from './AuthActions';
import type { AnalysisResult } from '../App';

interface HeaderProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  userHistory?: AnalysisResult[];
  onViewHistory?: (result: AnalysisResult) => void;
  showHistory?: boolean;
}

export function Header({
  isAuthenticated,
  onLogin,
  onLogout,
  userHistory = [],
  onViewHistory,
  showHistory = true,
}: HeaderProps) {
  // If the user is authenticated, hide the global header per request.
  if (isAuthenticated) return null;
  // Header for unauthenticated users only. Auth actions live in AuthActions component.

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={Logo} alt="D-BIAS" className="w-8 h-8 object-contain" />
              <span className="text-slate-900 font-semibold">D-BIAS</span>
            </div>

          <div className="flex items-center gap-3">
            <AuthActions onLogin={onLogin} onSignUp={() => {/* hook for future backend signup */}} userHistory={userHistory} onViewHistory={onViewHistory} showHistory={showHistory} />
          </div>
        </div>
      </header>

    </>
  );
}
