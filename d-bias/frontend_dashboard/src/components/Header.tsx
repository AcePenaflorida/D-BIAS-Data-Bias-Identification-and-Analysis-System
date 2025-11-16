"use client"

import { useState } from 'react'
import Logo from '../assets/logo-d-bias.svg'
import { Button } from './ui/button'
import { LogIn, UserPlus } from 'lucide-react'
import { AuthActions } from './AuthActions'
import type { AnalysisResult } from '../App'

interface HeaderProps {
  isAuthenticated: boolean
  onLogin: () => void
  onLogout: () => void
  userHistory?: AnalysisResult[]
  onViewHistory?: (result: AnalysisResult) => void
  showHistory?: boolean
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
  if (isAuthenticated) return null

  return (
    <>
  <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={Logo} alt="D-BIAS" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-semibold text-foreground">D-BIAS</h1>
          </div>
          <div className="flex items-center gap-3">
            <AuthActions onLogin={onLogin} onSignUp={() => { /* hook for future backend signup */ }} userHistory={userHistory} onViewHistory={onViewHistory} showHistory={showHistory} />
          </div>
        </div>
      </header>

    </>
  )
}
