import React, { useEffect, useState } from 'react';
import Logo from '../assets/logo_ver2.png';
import { User, History, LogOut, Menu } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import HistoryDialog from './HistoryDialog';
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

  const filteredRows = dbRows
    .filter(r => {
      if (filterText) {
        const txt = `${r.description || ''}`.toLowerCase();
        if (!txt.includes(filterText.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 1 : 0;
      const bp = pinnedIds.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (sortMode === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortMode === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortMode === 'az') return String(a.description || '').localeCompare(String(b.description || ''));
      if (sortMode === 'za') return String(b.description || '').localeCompare(String(a.description || ''));
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
    setDbRows(prev => prev.filter(r => r.id !== row.id));
    setPendingDeletes(prev => ({ ...prev, [row.id]: row }));
    const timer = setTimeout(async () => {
      try {
        await deleteAnalysis(row.id, row);
      } catch (e: any) {
        setDbRows(prev => [...prev, row]);
        toast.error('Failed to permanently delete item');
      } finally {
        setPendingDeletes(prev => { const { [row.id]: _, ...rest } = prev; return rest; });
        delete pendingTimersRef.current[row.id];
      }
    }, UNDO_TIMEOUT_MS);
    pendingTimersRef.current[row.id] = timer;
    toast.info('History item deleted', {
      action: { label: 'Undo', onClick: () => undoDelete(row.id) },
      duration: UNDO_TIMEOUT_MS
    });
  };

  const undoDelete = (id: number) => {
    const row = pendingDeletes[id];
    if (!row) return;
    const t = pendingTimersRef.current[id];
    if (t) clearTimeout(t);
    delete pendingTimersRef.current[id];
    setPendingDeletes(prev => { const { [id]: _, ...rest } = prev; return rest; });
    setDbRows(prev => [...prev, row]);
    toast.success('Deletion undone');
  };

  // Only render any UI if the user is authenticated
  if (!isAuthenticated) return null;

  const asideWidthClass = collapsed ? 'w-16' : 'w-64';
  const asideInlineStyle: React.CSSProperties = { width: collapsed ? '4rem' : '16rem' };

  const requestLogout = () => setLogoutConfirmOpen(true);

  return (
    <aside style={asideInlineStyle} className={`relative min-h-screen flex-shrink-0 bg-slate-900 text-slate-100 shadow-lg transition-all duration-300 overflow-hidden`}>
      <div className="flex flex-col h-full">
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

        <nav className="flex-1 flex flex-col items-start gap-2 mt-4 w-full px-2 py-2">
          <button
            title="Profile"
            className="w-full h-10 rounded-md flex items-center gap-3 px-2 hover:bg-slate-700/5"
            onClick={() => {
              if (!isAuthenticated) { onLogin?.(); return; }
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
            onClick={() => setOpenHistory(true)}
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
              if (!isAuthenticated) { onLogin?.(); return; }
              requestLogout();
            }}
          >
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-slate-800">
              <LogOut className="w-5 h-5 text-slate-100" />
            </div>
            {!collapsed && <span className="text-sm text-slate-100">Logout</span>}
          </button>
        </nav>
      </div>

      <HistoryDialog open={openHistory} onOpenChange={setOpenHistory} isAuthenticated={isAuthenticated ?? false} onLogin={onLogin} onViewHistory={onViewHistory} onRefreshHistory={onRefreshHistory} />

      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm logout</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-700">Are you sure you want to log out?</div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogoutConfirmOpen(false)}>No</Button>
            <Button variant="destructive" size="sm" onClick={() => { setLogoutConfirmOpen(false); setOpenHistory(false); onLogout?.(); }}>Yes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openProfile} onOpenChange={(v) => { setOpenProfile(v); if (v) loadProfile(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Full name</label>
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Your full name" className="bg-white" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Email</label>
              <Input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@example.com" className="bg-white" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Password</label>
              <Input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Enter new password (leave blank to keep current)" className="bg-white" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-600">Confirm Password</label>
              <Input type="password" value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value)} placeholder="Confirm new password" className="bg-white" />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setNameInput(profile?.name ?? ''); setEmailInput(profile?.email ?? ''); setPasswordInput(''); setConfirmPasswordInput(''); setOpenProfile(false); }} disabled={profileLoading}>Cancel</Button>
              <Button size="sm" onClick={async () => {
                if (passwordInput || confirmPasswordInput) {
                  if (passwordInput !== confirmPasswordInput) { toast.error('Passwords do not match'); return; }
                  if (passwordInput.length > 0 && passwordInput.length < 6) { toast.error('Password must be at least 6 characters'); return; }
                }
                if (!nameInput.trim() || !emailInput.trim()) { toast.error('Name and email are required'); return; }
                setProfileLoading(true);
                try {
                  const payload: Profile = { name: nameInput.trim(), email: emailInput.trim() };
                  if (passwordInput) payload.password = passwordInput;
                  let saved: Profile;
                  if (profile && profile.id) saved = await updateProfile(profile.id, payload); else saved = await createProfile(payload);
                  setProfile(saved); setNameInput(saved.name ?? ''); setEmailInput(saved.email ?? ''); setPasswordInput(''); setConfirmPasswordInput(''); toast.success('Profile saved');
                } catch (e: any) { toast.error('Error saving profile: ' + (e?.message || String(e))); } finally { setProfileLoading(false); }
              }} disabled={profileLoading}>{profileLoading ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedHistory && (
        <PDFPreviewDialog isOpen={showPreviewDialog} onClose={() => setShowPreviewDialog(false)} result={selectedHistory} />
      )}

      <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) { setConfirmDeleteId(null); setConfirmDeleteRow(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete History Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">Are you sure you want to delete this history item?</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setConfirmDeleteId(null); setConfirmDeleteRow(null); }}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => { if (confirmDeleteRow) startDelete(confirmDeleteRow); setConfirmDeleteId(null); setConfirmDeleteRow(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
    
