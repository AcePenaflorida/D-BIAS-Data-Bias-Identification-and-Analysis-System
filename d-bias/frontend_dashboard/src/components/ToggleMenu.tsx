import React, { useEffect, useState } from 'react';
import Logo from '../assets/logo-d-bias.svg';
import { User, History, LogOut, Menu } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { PDFPreviewDialog } from './PDFPreviewDialog';
import type { AnalysisResult } from '../App';
import { getProfile, updateProfile, deleteProfile, createProfile, Profile, fetchLatestCachedAnalysis, mapAnalysisFromJson } from '../services/api';
import { listAnalysesByUser, deleteAnalysis } from '../services/db';
import { Input } from './ui/input';
import { toast } from 'sonner';

interface ToggleMenuProps {
  userHistory?: AnalysisResult[];
  onViewHistory?: (r: AnalysisResult) => void;
  onLogout?: () => void;
  onLogin?: () => void;
  isAuthenticated?: boolean;
  onRefreshHistory?: () => Promise<void> | void;
}

export default function ToggleMenu({ userHistory = [], onViewHistory, onLogout, onLogin, isAuthenticated = false, onRefreshHistory }: ToggleMenuProps) {
  const [openHistory, setOpenHistory] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null);
  const [dbRows, setDbRows] = useState<Array<any>>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<any | null>(null);
  const pendingTimersRef = React.useRef<Record<number, any>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Record<number, any>>({});
  const UNDO_TIMEOUT_MS = 8000;

  async function loadProfile() {
    setProfileLoading(true);
    try {
      const p = await getProfile();
      if (p) {
        setProfile(p);
        setNameInput(p.name ?? '');
        setEmailInput(p.email ?? '');
      }
    } catch (e) {
      // ignore load errors; UI will fallback to empty
    } finally {
      setProfileLoading(false);
    }
  }

  // Keep a CSS variable on :root so main content can adjust when sidebar width changes
  useEffect(() => {
    const widthPx = collapsed ? 64 : 256; // 4rem or 16rem
    try {
      document.documentElement.style.setProperty('--sidebar-width', `${widthPx}px`);
    } catch {}
    return () => {
      try { document.documentElement.style.removeProperty('--sidebar-width'); } catch {}
    };
  }, [collapsed]);

  // Fetch DB rows when History dialog opens
  useEffect(() => {
    if (!openHistory || !isAuthenticated) return;
    let mounted = true;
    setDbLoading(true);
    (async () => {
      try {
        const rows = await listAnalysesByUser();
        if (mounted) setDbRows(rows || []);
      } catch {
        if (mounted) setDbRows([]);
      } finally {
        if (mounted) setDbLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [openHistory, isAuthenticated]);

  // Load pinned IDs from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dbias_pinned');
      if (raw) setPinnedIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const persistPins = (next: Set<number>) => {
    setPinnedIds(next);
    try { localStorage.setItem('dbias_pinned', JSON.stringify(Array.from(next))); } catch {}
  };

  const togglePin = (id: number) => {
    const next = new Set(pinnedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    persistPins(next);
  };

  // compare feature removed

  // old filteredRows definition removed
  const filteredRows = dbRows
    .filter(r => {
      if (filterText) {
        const txt = `${r.description || ''}`.toLowerCase();
        if (!txt.includes(filterText.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // pinned precedence
      const ap = pinnedIds.has(a.id) ? 1 : 0;
      const bp = pinnedIds.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap; // pinned first
      if (sortMode === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortMode === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortMode === 'az') {
        return String(a.description || '').localeCompare(String(b.description || ''));
      } else if (sortMode === 'za') {
        return String(b.description || '').localeCompare(String(a.description || ''));
      }
      return 0;
    });

  const performDownload = async (row: any) => {
    try {
      const pdfResp = await fetch(row.report_url, { cache: 'no-store' });
      if (!pdfResp.ok) throw new Error(`PDF fetch failed (HTTP ${pdfResp.status})`);
      const pdfBlob = await pdfResp.blob();
      const a = document.createElement('a');
      const base = (row.description || 'analysis').toString().replace(/[^a-z0-9-_]+/gi, '-');
      a.href = URL.createObjectURL(pdfBlob);
      a.download = `${base}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error('PDF download failed: ' + (e?.message || 'Unknown error'));
    }
  };

  const startDelete = (row: any) => {
    if (!row) return;
    // Optimistic removal
    setDbRows(prev => prev.filter(r => r.id !== row.id));
    setPendingDeletes(prev => ({ ...prev, [row.id]: row }));
    // Schedule permanent delete
    const timer = setTimeout(async () => {
      try {
        await deleteAnalysis(row.id, row);
      } catch (e: any) {
        // If permanent delete fails, restore row
        setDbRows(prev => [...prev, row]);
        toast.error('Failed to permanently delete item');
      } finally {
        setPendingDeletes(prev => { const { [row.id]: _, ...rest } = prev; return rest; });
        delete pendingTimersRef.current[row.id];
      }
    }, UNDO_TIMEOUT_MS);
    pendingTimersRef.current[row.id] = timer;
    toast.info('History item deleted', {
      action: {
        label: 'Undo',
        onClick: () => undoDelete(row.id)
      },
      duration: UNDO_TIMEOUT_MS
    });
  };

  const undoDelete = (id: number) => {
    const row = pendingDeletes[id];
    if (!row) return;
    // Cancel timer
    const t = pendingTimersRef.current[id];
    if (t) clearTimeout(t);
    delete pendingTimersRef.current[id];
    setPendingDeletes(prev => { const { [id]: _, ...rest } = prev; return rest; });
    // Restore row and re-apply sort ordering by injecting then letting filteredRows compute
    setDbRows(prev => [...prev, row]);
    toast.success('Deletion undone');
  };

  // Only render any UI if the user is authenticated
  if (!isAuthenticated) return null;

  // Always render the sidebar when authenticated
  const asideWidthClass = collapsed ? 'w-16' : 'w-64';
  const asideInlineStyle: React.CSSProperties = { width: collapsed ? '4rem' : '16rem' };

  const requestLogout = () => setLogoutConfirmOpen(true);

  return (
    <aside style={asideInlineStyle} className={`relative min-h-screen flex-shrink-0 bg-slate-900 text-slate-100 shadow-lg transition-all duration-300 overflow-hidden`}>
      <div className="flex flex-col h-full">
        {/* Logo at the top */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {!collapsed && (
              <>
                <img src={Logo} alt="D-BIAS" className="w-8 h-8 object-contain" />
                <span className="text-lg font-semibold">D-BIAS</span>
              </>
            )}
          </div>
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-md hover:bg-slate-800/50"
            onClick={() => setCollapsed((c) => !c)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

  {/* Menu items */}
  <nav className="flex-1 flex flex-col items-start gap-2 mt-4 w-full px-2 py-2">
          <button
            title="Profile"
            className="w-full h-10 rounded-md flex items-center gap-3 px-2 hover:bg-slate-700/5"
            onClick={() => {
              if (!isAuthenticated) {
                onLogin?.();
                return;
              }
              setOpenProfile(true);
            }}
          >
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-slate-800">
              <User className="w-5 h-5 text-slate-100" />
            </div>
            {!collapsed && <span className="text-sm text-slate-100">Profile</span>}
          </button>

          <button
            title="History"
            className="w-full h-10 rounded-md flex items-center gap-3 px-2 hover:bg-slate-700/5"
            onClick={() => {
              setOpenHistory(true);
            }}
          >
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-slate-800">
              <History className="w-5 h-5 text-slate-100" />
            </div>
            {!collapsed && <span className="text-sm text-slate-100">History</span>}
          </button>
          
          <button
            title="Logout"
            className="w-full h-10 rounded-md flex items-center gap-3 px-2 hover:bg-slate-700/5"
            onClick={() => {
              if (!isAuthenticated) {
                onLogin?.();
                return;
              }
              requestLogout();
            }}
          >
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-slate-800">
              <LogOut className="w-5 h-5 text-slate-100" />
            </div>
            {!collapsed && <span className="text-sm text-slate-100">Logout</span>}
          </button>
          
          {/* no extra links - only Profile, History, Logout */}
        </nav>

        {/* bottom logout removed — Logout is available in the main nav and in History footer */}
      </div>

      {/* History Dialog */}
      <Dialog open={openHistory} onOpenChange={setOpenHistory}>
        <DialogContent
          className="w-[90vw] max-w-[1100px] min-w-[340px] max-h-[80vh] rounded-xl overflow-visible"
          style={{
            padding: '2rem',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
          }}
        >
          <div className="w-full relative">
            <DialogHeader className="w-full text-center">
              <DialogTitle className="flex items-center justify-between">
                <span className="flex-1 text-center">Analysis History</span>
                <div className="absolute right-0 top-0 mt-1 mr-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await onRefreshHistory?.();
                        toast.success('History refreshed');
                      } catch (e: any) {
                        toast.error('Failed to refresh history');
                      }
                    }}
                  >
                    Refresh
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            {/* Close button intentionally removed per request */}

            <div className="space-y-3 max-h-96 overflow-y-auto mt-3">
              {/* Filter & Sort controls */}
              <div className="space-y-2 px-1">
                <Input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Search description..."
                  className="bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as any)}
                    className="bg-white text-sm border rounded-md px-2 py-1"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                  </select>
                  {filterText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setFilterText(''); }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {dbLoading && <p className="text-xs text-slate-500 px-2">Loading...</p>}
              {!isAuthenticated ? (
                <div className="p-6 text-center">
                  <p className="text-slate-700 mb-3">Please log in to view your analysis history.</p>
                  <div className="flex justify-center">
                    <button
                      className="px-3 py-2 bg-blue-600 text-white rounded-md"
                      onClick={() => {
                        onLogin?.();
                        setOpenHistory(false);
                      }}
                    >
                      Login
                    </button>
                  </div>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-slate-500">No analysis history yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const latest = await fetchLatestCachedAnalysis();
                        if (!latest) {
                          toast.error('No cached analysis found');
                          return;
                        }
                        setSelectedHistory(latest);
                        setShowPreviewDialog(true);
                      } catch {
                        toast.error('Failed to load cached analysis');
                      }
                    }}
                  >
                    Load Latest Cached
                  </Button>
                </div>
              ) : (
                <div
                  className="w-full"
                  style={{
                    overflowX: 'auto',
                    paddingBottom: '0.5rem',
                  }}
                >
                  {filteredRows.map((row) => (
                    <div
                      key={row.id}
                      className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors mb-3 flex flex-col gap-2"
                      style={{
                        minWidth: '320px',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Compact pin icon */}
                          <button
                            onClick={() => togglePin(row.id)}
                            title={pinnedIds.has(row.id) ? 'Unpin' : 'Pin'}
                            className={`p-1 rounded-full border-none bg-transparent focus:outline-none ${pinnedIds.has(row.id) ? 'text-blue-600' : 'text-slate-400'} hover:text-blue-500`}
                            style={{ minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ display: 'block' }}>
                              <path d="M7.5 2a2.5 2.5 0 0 1 5 0v2.09c0 .36.19.7.5.88l3.13 1.88a1 1 0 0 1-.08 1.76l-3.05 1.53a1 1 0 0 0-.55.89V17a1 1 0 0 1-2 0v-5.97a1 1 0 0 0-.55-.89l-3.05-1.53a1 1 0 0 1-.08-1.76l3.13-1.88a1 1 0 0 0 .5-.88V2z" />
                            </svg>
                          </button>
                          {/* Filename with ellipsis truncation */}
                          <span
                            className="font-semibold text-slate-900 text-base truncate"
                            style={{
                              maxWidth: '220px',
                              display: 'inline-block',
                              verticalAlign: 'middle',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={row.description || 'analysis'}
                          >
                            {row.description || 'analysis'}
                          </span>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0">saved</span>
                      </div>
                      <div className="flex flex-row gap-4 items-start justify-between">
                        {/* Date/time left, buttons right vertical */}
                        <div className="flex flex-col items-start justify-center gap-1 min-w-[120px]">
                          <span className="text-sm text-slate-500 font-mono">
                            {new Date(row.created_at).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              (async () => {
                                try {
                                  const href: string = row.analysis_json_url;
                                  const res = await fetch(href, { cache: 'no-store' });
                                  const txt = await res.text();
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  let data: any;
                                  try { data = JSON.parse(txt); } catch { throw new Error('Invalid JSON'); }
                                  const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv'));
                                  setSelectedHistory(mapped);
                                  setShowPreviewDialog(true);
                                } catch {
                                  toast.error('Failed to load analysis JSON (preview)');
                                }
                              })();
                            }}
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              (async () => {
                                try {
                                  const href: string = row.analysis_json_url;
                                  const res = await fetch(href, { cache: 'no-store' });
                                  const txt = await res.text();
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  let data: any;
                                  try { data = JSON.parse(txt); } catch { throw new Error('Invalid JSON'); }
                                  const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv'));
                                  onViewHistory?.(mapped);
                                  setOpenHistory(false);
                                } catch {
                                  toast.error('Failed to open analysis (JSON)');
                                }
                              })();
                            }}
                            className="bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 focus:bg-blue-700 font-semibold px-4 py-2 rounded shadow"
                            style={{ minWidth: 64, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backgroundColor: '#2563eb', border: '1px solid #2563eb' }}
                          >
                            <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', letterSpacing: '0.01em' }}>Open</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => performDownload(row)}
                            className="flex items-center gap-1"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/></svg>
                            <span>Download PDF</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setConfirmDeleteId(row.id); setConfirmDeleteRow(row); }}
                            className="flex items-center gap-1"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            <span>Delete</span>
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs mt-2 text-slate-600 flex-wrap">
                        <a className="underline" href={row.analysis_json_url} target="_blank" rel="noreferrer">JSON</a>
                        <a className="underline" href={row.report_url} target="_blank" rel="noreferrer">PDF</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer area for history dialog (Close button) */}
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpenHistory(false)}>
              Close
            </Button>
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
            <Button variant="outline" size="sm" onClick={() => setLogoutConfirmOpen(false)}>
              No
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setLogoutConfirmOpen(false);
                setOpenHistory(false);
                onLogout?.();
              }}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Profile Dialog */}
      <Dialog open={openProfile} onOpenChange={(v) => { setOpenProfile(v); if (v) loadProfile(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Full name</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your full name"
                className="bg-white"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Email</label>
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="bg-white"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Password</label>
              <Input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter new password (leave blank to keep current)"
                className="bg-white"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Confirm Password</label>
              <Input
                type="password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                placeholder="Confirm new password"
                className="bg-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // revert edits and close
                  setNameInput(profile?.name ?? '');
                  setEmailInput(profile?.email ?? '');
                  setPasswordInput('');
                  setConfirmPasswordInput('');
                  setOpenProfile(false);
                }}
                disabled={profileLoading}
              >
                Cancel
              </Button>

              <Button
                size="sm"
                onClick={async () => {
                  // basic validation
                  if (passwordInput || confirmPasswordInput) {
                    if (passwordInput !== confirmPasswordInput) {
                      toast.error('Passwords do not match');
                      return;
                    }
                    if (passwordInput.length > 0 && passwordInput.length < 6) {
                      toast.error('Password must be at least 6 characters');
                      return;
                    }
                  }

                  if (!nameInput.trim() || !emailInput.trim()) {
                    toast.error('Name and email are required');
                    return;
                  }

                  setProfileLoading(true);
                  try {
                    const payload: Profile = { name: nameInput.trim(), email: emailInput.trim() };
                    if (passwordInput) payload.password = passwordInput;

                    let saved: Profile;
                    if (profile && profile.id) {
                      saved = await updateProfile(profile.id, payload);
                    } else {
                      saved = await createProfile(payload);
                    }
                    setProfile(saved);
                    setNameInput(saved.name ?? '');
                    setEmailInput(saved.email ?? '');
                    setPasswordInput('');
                    setConfirmPasswordInput('');
                    toast.success('Profile saved');
                  } catch (e: any) {
                    toast.error('Error saving profile: ' + (e?.message || String(e)));
                  } finally {
                    setProfileLoading(false);
                  }
                }}
                disabled={profileLoading}
              >
                {profileLoading ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      
      {selectedHistory && (
        <PDFPreviewDialog
          isOpen={showPreviewDialog}
          onClose={() => setShowPreviewDialog(false)}
          result={selectedHistory}
        />
      )}
      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) { setConfirmDeleteId(null); setConfirmDeleteRow(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete History Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">Are you sure you want to delete this history item?</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setConfirmDeleteId(null); setConfirmDeleteRow(null); }}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirmDeleteRow) startDelete(confirmDeleteRow);
                setConfirmDeleteId(null);
                setConfirmDeleteRow(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* CompareDialog removed */}
    </aside>
  );
}
