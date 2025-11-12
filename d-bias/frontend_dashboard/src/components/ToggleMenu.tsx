import React, { useEffect, useState } from 'react';
import Logo from '../assets/logo-d-bias.svg';
import { User, History, LogOut, Menu, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { PDFPreviewDialog } from './PDFPreviewDialog';
import type { AnalysisResult } from '../App';
import { getProfile, updateProfile, deleteProfile, createProfile, Profile } from '../services/api';
import { Input } from './ui/input';
import { toast } from 'sonner';

interface ToggleMenuProps {
  userHistory?: AnalysisResult[];
  onViewHistory?: (r: AnalysisResult) => void;
  onLogout?: () => void;
  onLogin?: () => void;
  isAuthenticated?: boolean;
}

export default function ToggleMenu({ userHistory = [], onViewHistory, onLogout, onLogin, isAuthenticated = false }: ToggleMenuProps) {
  const [openHistory, setOpenHistory] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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
        <DialogContent className="max-w-md">
          <div className="w-full relative">
            <DialogHeader className="w-full text-center">
              <DialogTitle>Analysis History</DialogTitle>
            </DialogHeader>
            {/* Close button intentionally removed per request */}

            <div className="space-y-3 max-h-96 overflow-y-auto mt-3">
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
              ) : userHistory.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No analysis history yet</p>
              ) : (
                userHistory.map((result) => (
                  <div
                    key={result.id}
                    className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="text-slate-900">{result.datasetName}</h4>
                        <p className="text-sm text-slate-500">
                          {new Date(result.uploadDate).toLocaleDateString()} at{' '}
                          {new Date(result.uploadDate).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            result.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {result.status}
                        </span>
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedHistory(result);
                              setShowPreviewDialog(true);
                            }}
                          >
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              onViewHistory?.(result);
                              setOpenHistory(false);
                            }}
                          >
                            Open
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm mt-2">
                      <span className="text-slate-600">
                        Fairness: <span className="text-slate-900">{result.fairnessScore}/100</span>
                      </span>
                      <span className="text-slate-600">
                        Risk: <span className="text-slate-900">{result.biasRisk}</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer area for history dialog (Close button) */}
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpenHistory(false)}>Close</Button>
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
    </aside>
  );
}
