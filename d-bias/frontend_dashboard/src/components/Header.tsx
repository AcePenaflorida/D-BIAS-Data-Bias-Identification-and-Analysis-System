"use client"

import React, { useEffect, useState } from 'react'
import Logo from '../assets/logo_ver11.png'
import { Button } from './ui/button'
import { LogIn, UserPlus, User as UserIcon, History as HistoryIcon, LogOut, Loader2 } from 'lucide-react'
import { AuthActions } from './AuthActions'
import type { AnalysisResult } from '../App'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import HistoryDialog from './HistoryDialog'
import { Input } from './ui/input'
import { listAnalysesByUser, deleteAnalysis } from '../services/db'
import { fetchLatestCachedAnalysis, mapAnalysisFromJson, getProfile as apiGetProfile, updateProfile as apiUpdateProfile } from '../services/api'
import { getCurrentUser } from '../services/auth'
import { PDFPreviewDialog } from './PDFPreviewDialog'
import { toast } from 'sonner'

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
  // Local state for history/profile dialogs
  const [openHistory, setOpenHistory] = useState(false)
  const [historyRows, setHistoryRows] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null)
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set())

  // Load pinned IDs from localStorage for simple client-side pin UI
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dbias_pinned')
      if (raw) setPinnedIds(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  const persistPins = (next: Set<number>) => {
    setPinnedIds(next)
    try { localStorage.setItem('dbias_pinned', JSON.stringify(Array.from(next))) } catch {}
  }

  const togglePin = (id: number) => {
    const next = new Set(pinnedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    persistPins(next)
  }

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [showLogoutSpinner, setShowLogoutSpinner] = useState(false)


  useEffect(() => {
    // Profile icon and logic removed as requested.
  }, [isAuthenticated])

  useEffect(() => {
    if (!openHistory) return
    let mounted = true
    setHistoryLoading(true)
    ;(async () => {
      try {
        const rows = await listAnalysesByUser()
        if (!mounted) return
        setHistoryRows(rows || [])
      } catch (e) {
        if (!mounted) return
        setHistoryRows([])
      } finally {
        if (mounted) setHistoryLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [openHistory, isAuthenticated])

  const refreshHistory = async () => {
    setHistoryLoading(true)
    try {
      const rows = await listAnalysesByUser()
      setHistoryRows(rows || [])
      toast.success('History refreshed')
    } catch {
      toast.error('Failed to refresh history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const performDownload = async (row: any) => {
    try {
      const pdfResp = await fetch(row.report_url, { cache: 'no-store' })
      if (!pdfResp.ok) throw new Error(`PDF fetch failed (HTTP ${pdfResp.status})`)
      const pdfBlob = await pdfResp.blob()
      const a = document.createElement('a')
      const base = (row.description || 'analysis').toString().replace(/[^a-z0-9-_]+/gi, '-')
      a.href = URL.createObjectURL(pdfBlob)
      a.download = `${base}.pdf`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000)
      toast.success('PDF downloaded')
    } catch (e: any) {
      toast.error('PDF download failed: ' + (e?.message || 'Unknown error'))
    }
  }

  const requestDelete = async (row: any) => {
    try {
      await deleteAnalysis(row.id, row)
      setHistoryRows((prev) => prev.filter((r) => r.id !== row.id))
      toast.success('Deleted')
    } catch (e: any) {
      toast.error('Failed to delete: ' + (e?.message || ''))
    }
  }

  // Open cached latest JSON and preview
  const loadLatestCached = async () => {
    try {
      const latest = await fetchLatestCachedAnalysis()
      if (!latest) { toast.error('No cached analysis found'); return }
      setSelectedHistory(latest)
      setShowPreviewDialog(true)
    } catch {
      toast.error('Failed to load cached analysis')
    }
  }

  // const saveProfile = async () => {
  //   setProfileLoading(true)
  //   try {
  //     const payload = { name: profileName, email: profileEmail }
  //     const saved = await apiUpdateProfile(undefined as any, payload as any)
  //     setProfileName(saved.name ?? profileName)
  //     setProfileEmail(saved.email ?? profileEmail)
  //     setProfileInitial((saved.name || profileName || '').trim().charAt(0).toUpperCase())
  //     toast.success('Profile saved')
  //     setProfileOpen(false)
  //   } catch (e: any) {
  //     toast.error('Error saving profile: ' + (e?.message || String(e)))
  //   } finally {
  //     setProfileLoading(false)
  //   }
  // }

  return (
    <>
      {/* Show spinner overlay during logout */}
      {showLogoutSpinner && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white bg-opacity-80 transition-all duration-300">
          <div className="flex flex-col items-center">
            <Loader2 className="animate-spin text-blue-600 w-12 h-12 mb-4" />
            <span className="text-lg font-medium text-slate-700">Logging out...</span>
          </div>
        </div>
      )}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* <img src={Logo} alt="D-BIAS" className="w-8 h-8 object-contain" /> */}
            <img src={Logo} alt="D-BIAS" className="w-9 h-9 object-contain" />
            {/* <h1 className="text-2xl font-extrabold text-foreground tracking-wide !font-extrabold">D-BIAS</h1> */}
          </div>

          <div className="flex items-center gap-3">
            {!isAuthenticated ? (
              <AuthActions onLogin={onLogin} onSignUp={() => { /* future */ }} userHistory={userHistory} onViewHistory={onViewHistory} showHistory={showHistory} />
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setOpenHistory(true)}>
                  <HistoryIcon className="w-6 h-6 mr-2" />
                  History
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLogoutConfirmOpen(true)}>
                  <LogOut className="w-6 h-6 mr-2" />
                  Logout
                </Button>
              </>
            )}
          </div>
        </div>

        <HistoryDialog open={openHistory} onOpenChange={setOpenHistory} isAuthenticated={isAuthenticated} onLogin={onLogin} onViewHistory={onViewHistory} onRefreshHistory={refreshHistory} />

        {/* Profile Dialog */}
        {/* Profile dialog removed as requested. */}

        {/* Logout confirmation dialog */}
        <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <DialogContent className="w-full max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm logout</DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-slate-700">Are you sure you want to log out?</div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setLogoutConfirmOpen(false)}>No</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  setLogoutConfirmOpen(false);
                  setShowLogoutSpinner(true);
                  setOpenHistory(false);
                  // Wait a short moment for smooth transition
                  await new Promise(res => setTimeout(res, 500));
                  await onLogout();
                  // Optionally, keep spinner for a moment after logout
                  setTimeout(() => setShowLogoutSpinner(false), 800);
                }}
              >
                Yes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {selectedHistory && (
          <PDFPreviewDialog isOpen={showPreviewDialog} onClose={() => setShowPreviewDialog(false)} result={selectedHistory} />
        )}
      </header>
    </>
  )
}

export default Header
