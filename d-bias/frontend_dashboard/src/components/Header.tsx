"use client"

import React, { useEffect, useState } from 'react'
import Logo from '../assets/logo_ver2.png'
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

  // Profile state
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileInitial, setProfileInitial] = useState<string | null>(null)
  const [profileImage, setProfileImage] = useState<string | null>(null)

  useEffect(() => {
    // Load lightweight avatar info from Supabase user metadata + backend profile
    let mounted = true
    ;(async () => {
      try {
        const u = await getCurrentUser()
        if (!mounted) return
        const meta: any = (u as any)?.user_metadata ?? {}
        const avatar = meta?.avatar_url || meta?.picture || meta?.picture_url || meta?.avatar || null
        if (avatar) setProfileImage(String(avatar))
        // fallback to backend profile for name
        const p = await apiGetProfile()
        if (!mounted) return
        if (p && p.name) {
          setProfileName(p.name)
          setProfileEmail(p.email ?? '')
          setProfileInitial((p.name || '').trim().charAt(0).toUpperCase())
        } else if (u && (u as any).email) {
          const nameFromEmail = String((u as any).email).split('@')[0] || ''
          setProfileInitial((nameFromEmail || '').trim().charAt(0).toUpperCase())
        }
      } catch {}
    })()
    return () => { mounted = false }
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

  const saveProfile = async () => {
    setProfileLoading(true)
    try {
      const payload = { name: profileName, email: profileEmail }
      const saved = await apiUpdateProfile(undefined as any, payload as any)
      setProfileName(saved.name ?? profileName)
      setProfileEmail(saved.email ?? profileEmail)
      setProfileInitial((saved.name || profileName || '').trim().charAt(0).toUpperCase())
      toast.success('Profile saved')
      setProfileOpen(false)
    } catch (e: any) {
      toast.error('Error saving profile: ' + (e?.message || String(e)))
    } finally {
      setProfileLoading(false)
    }
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={Logo} alt="D-BIAS" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-semibold text-foreground">D-BIAS</h1>
        </div>

        <div className="flex items-center gap-3">
          {!isAuthenticated ? (
            <AuthActions onLogin={onLogin} onSignUp={() => { /* future */ }} userHistory={userHistory} onViewHistory={onViewHistory} showHistory={showHistory} />
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpenHistory(true)}>
                <HistoryIcon className="w-4 h-4 mr-2" />
                History
              </Button>

              <button
                title="Profile"
                onClick={() => setProfileOpen(true)}
                className="inline-flex items-center gap-2 rounded-md hover:bg-slate-100 p-1"
              >
                {profileImage ? (
                  <img src={profileImage} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-700">
                    {profileInitial || 'U'}
                  </div>
                )}
              </button>

              <Button variant="ghost" size="sm" onClick={() => setLogoutConfirmOpen(true)}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </>
          )}
        </div>
      </div>

      <HistoryDialog open={openHistory} onOpenChange={setOpenHistory} isAuthenticated={isAuthenticated} onLogin={onLogin} onViewHistory={onViewHistory} onRefreshHistory={refreshHistory} />

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={(v) => { setProfileOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Full name</label>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your full name" className="bg-white" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Email</label>
              <Input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} placeholder="you@example.com" className="bg-white" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Password</label>
              <Input type="password" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} placeholder="Enter new password (leave blank to keep current)" className="bg-white" />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setProfileOpen(false)} disabled={profileLoading}>Cancel</Button>
              <Button size="sm" onClick={saveProfile} disabled={profileLoading}>{profileLoading ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout confirmation dialog */}
      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm logout</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-700">Are you sure you want to log out?</div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogoutConfirmOpen(false)}>No</Button>
            <Button variant="destructive" size="sm" onClick={() => { setLogoutConfirmOpen(false); setOpenHistory(false); onLogout(); }}>Yes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedHistory && (
        <PDFPreviewDialog isOpen={showPreviewDialog} onClose={() => setShowPreviewDialog(false)} result={selectedHistory} />
      )}
    </header>
  )
}

export default Header
