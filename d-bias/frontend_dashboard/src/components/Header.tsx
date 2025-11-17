"use client"

import React, { useEffect, useState } from 'react'
import Logo from '../assets/logo-d-bias.svg'
import { Button } from './ui/button'
import { LogIn, UserPlus, User as UserIcon, History as HistoryIcon, LogOut, Loader2 } from 'lucide-react'
import { AuthActions } from './AuthActions'
import type { AnalysisResult } from '../App'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
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

      {/* History Dialog */}
      <Dialog open={openHistory} onOpenChange={setOpenHistory}>
        <DialogContent className="max-w-md">
          <div className="w-full relative">
            <DialogHeader className="w-full text-center">
              <DialogTitle className="flex items-center justify-between">
                <span className="flex-1 text-center">Analysis History</span>
                <div className="absolute right-0 top-0 mt-1 mr-1">
                  <Button variant="outline" size="sm" onClick={refreshHistory}>
                    Refresh
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 max-h-96 overflow-y-auto mt-3">
              {historyLoading && <p className="text-xs text-slate-500 px-2">Loading...</p>}
              {!isAuthenticated ? (
                <div className="p-6 text-center">
                  <p className="text-slate-700 mb-3">Please log in to view your analysis history.</p>
                  <div className="flex justify-center">
                    <button className="px-3 py-2 bg-blue-600 text-white rounded-md" onClick={() => { onLogin(); setOpenHistory(false); }}>
                      Login
                    </button>
                  </div>
                </div>
              ) : historyRows.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-slate-500">No analysis history yet</p>
                  <Button variant="outline" size="sm" onClick={loadLatestCached}>Load Latest Cached</Button>
                </div>
              ) : (
                historyRows.map((row) => (
                  <div key={row.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="text-slate-900">{row.description || 'analysis'}</h4>
                        <p className="text-sm text-slate-500">{new Date(row.created_at).toLocaleDateString()} at {new Date(row.created_at).toLocaleTimeString()}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">saved</span>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Button size="sm" onClick={async () => {
                            try {
                              const href: string = row.analysis_json_url
                              const res = await fetch(href, { cache: 'no-store' })
                              const txt = await res.text()
                              if (!res.ok) throw new Error(`HTTP ${res.status}`)
                              let data: any
                              try { data = JSON.parse(txt) } catch { throw new Error('Invalid JSON') }
                              const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv'))
                              setSelectedHistory(mapped)
                              setShowPreviewDialog(true)
                            } catch {
                              toast.error('Failed to load analysis JSON (preview)')
                            }
                          }}>Preview</Button>

                          <Button size="sm" onClick={async () => {
                            try {
                              const href: string = row.analysis_json_url
                              const res = await fetch(href, { cache: 'no-store' })
                              const txt = await res.text()
                              if (!res.ok) throw new Error(`HTTP ${res.status}`)
                              let data: any
                              try { data = JSON.parse(txt) } catch { throw new Error('Invalid JSON') }
                              const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv'))
                              onViewHistory?.(mapped)
                              setOpenHistory(false)
                            } catch {
                              toast.error('Failed to open analysis (JSON)')
                            }
                          }}>Open</Button>

                          <Button size="sm" variant="outline" onClick={() => performDownload(row)}>Download PDF</Button>
                          <Button size="sm" variant="destructive" onClick={() => requestDelete(row)}>Delete</Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs mt-2 text-slate-600">
                      <a className="underline" href={row.analysis_json_url} target="_blank" rel="noreferrer">JSON</a>
                      <a className="underline" href={row.report_url} target="_blank" rel="noreferrer">PDF</a>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpenHistory(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
