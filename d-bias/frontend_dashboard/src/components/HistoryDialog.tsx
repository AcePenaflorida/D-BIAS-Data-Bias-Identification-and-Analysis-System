import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { listAnalysesByUser, deleteAnalysis } from '../services/db';
import { fetchLatestCachedAnalysis, mapAnalysisFromJson } from '../services/api';
import { PDFPreviewDialog } from './PDFPreviewDialog';

import type { AnalysisResult } from '../App';

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAuthenticated: boolean;
  onLogin?: () => void;
  onViewHistory?: (r: AnalysisResult) => void;
  onRefreshHistory?: () => Promise<void> | void;
}

export default function HistoryDialog({ open, onOpenChange, isAuthenticated, onLogin, onViewHistory, onRefreshHistory }: HistoryDialogProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const [selectedHistory, setSelectedHistory] = useState<AnalysisResult | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<any | null>(null);
  const pendingTimersRef = useRef<Record<number, any>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Record<number, any>>({});
  const UNDO_TIMEOUT_MS = 8000;

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

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const r = await listAnalysesByUser();
        if (mounted) setRows(r || []);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open, isAuthenticated]);

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
    setRows(prev => prev.filter(r => r.id !== row.id));
    setPendingDeletes(prev => ({ ...prev, [row.id]: row }));
    const timer = setTimeout(async () => {
      try {
        await deleteAnalysis(row.id, row);
      } catch (e: any) {
        setRows(prev => [...prev, row]);
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
    setRows(prev => [...prev, row]);
    toast.success('Deletion undone');
  };

  const filtered = rows
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-[1100px] min-w-[340px] max-h-[80vh] rounded-xl overflow-visible" style={{ padding: '1.5rem', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="w-full relative">
            <DialogHeader className="w-full text-center">
              <DialogTitle className="flex flex-col items-center gap-4 w-full">
                <span className="w-full text-center">Analysis History</span>
                <div className="flex flex-row flex-wrap items-center gap-3 w-full justify-center mt-2 bg-slate-50 rounded-xl shadow-sm px-6 py-4" style={{marginBottom: '18px'}}>
                  <Button variant="outline" size="sm" className="rounded-lg shadow-sm" onClick={async () => { try { await onRefreshHistory?.(); toast.success('History refreshed'); } catch { toast.error('Failed to refresh history'); } }}>Refresh</Button>
                  <Input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Search description..." className="bg-white w-56 rounded-lg shadow-sm border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} className="bg-white text-sm border rounded-lg shadow-sm px-2 py-1 focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                  </select>
                  {filterText && (<Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setFilterText('')}>Clear</Button>)}
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-6" style={{ maxHeight: '60vh', minHeight: '320px', height: '420px', overflowY: 'auto', paddingLeft: '8px', paddingRight: '8px' }}>
              {/* Filter & Sort controls removed from below, now in header row above */}

              {loading && (
                <div className="flex flex-col items-center justify-center py-16" style={{ minHeight: '320px', height: '420px' }}>
                  <svg className="animate-spin text-blue-500 mb-4" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" opacity="0.15" />
                    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" strokeDasharray="125.6" strokeDashoffset="94.2" strokeLinecap="round" />
                  </svg>
                  <span className="text-slate-500 text-lg font-medium">Loading analysis history…</span>
                </div>
              )}

              {!isAuthenticated ? (
                <div className="p-6 text-center">
                  <p className="text-slate-700 mb-3">Please log in to view your analysis history.</p>
                  <div className="flex justify-center">
                    <button className="px-3 py-2 bg-blue-600 text-white rounded-md" onClick={() => { onLogin?.(); onOpenChange(false); }}>Login</button>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4" style={{ minHeight: '320px', height: '420px' }}>
                  <div className="flex items-center justify-center mb-2">
                    {/* Simple icon for empty state */}
                    <svg width="48" height="48" fill="none" viewBox="0 0 48 48" stroke="currentColor" className="text-slate-300">
                      <rect x="8" y="12" width="32" height="24" rx="4" strokeWidth="2" stroke="currentColor" fill="none" />
                      <path d="M16 20h16M16 28h10" strokeWidth="2" stroke="currentColor" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-slate-500 text-lg font-medium">No analysis history yet</p>
                  <p className="text-xs text-slate-400 max-w-xs">Upload and analyze a dataset to see your results here. Your history will appear after your first analysis.</p>
                </div>
              ) : (
                <div className="w-full" style={{ overflowX: 'auto', paddingBottom: '1.5rem' }}>
                  {filtered.map((row) => (
                    <div key={row.id} className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all mb-6 p-4 flex flex-col gap-2 w-full" style={{ minWidth: '320px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      <div className="flex flex-row items-center gap-2 w-full justify-between">
                        {/* Pin Button */}
                        <button
                          onClick={() => togglePin(row.id)}
                          title={pinnedIds.has(row.id) ? 'Unpin' : 'Pin'}
                          className={`p-2 rounded-full border-none bg-slate-100 focus:outline-none transition-colors duration-150 ${pinnedIds.has(row.id) ? 'text-blue-600 bg-blue-50' : 'text-slate-400'} hover:text-yellow-500 hover:bg-yellow-100`}
                          style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef9c3'; e.currentTarget.style.color = '#eab308'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = pinnedIds.has(row.id) ? '#eff6ff' : '#f1f5f9'; e.currentTarget.style.color = pinnedIds.has(row.id) ? '#2563eb' : '#94a3b8'; }}
                        >
                          {/* Classic upright push pin SVG icon */}
                          <svg width="22" height="22" viewBox="0 0 24 24" fill={pinnedIds.has(row.id) ? '#eab308' : 'none'} stroke={pinnedIds.has(row.id) ? '#eab308' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                            <rect x="9" y="2" width="6" height="6" rx="2" />
                            <path d="M12 8v12" />
                            <path d="M9 8h6" />
                          </svg>
                        </button>
                        {/* Main Info */}
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2 w-full justify-between">
                            <span className="font-semibold text-slate-900 text-base truncate" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description || 'analysis'}>{row.description || 'analysis'}</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">saved</span>
                          </div>
                          <span className="text-xs text-slate-500 mt-1">{new Date(row.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                        {/* Links removed as requested */}
                      </div>
                      {/* Actions row below */}
                      <div className="flex flex-row gap-2 justify-end w-full mt-2">
                        <Button variant="outline" size="sm" className="rounded-lg transition-colors duration-150" style={{ border: '1px solid #e5e7eb', color: '#2563eb', backgroundColor: '#fff' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#1d4ed8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#2563eb'; }} onClick={async () => { try { const href: string = row.analysis_json_url; const res = await fetch(href, { cache: 'no-store' }); const txt = await res.text(); if (!res.ok) throw new Error(`HTTP ${res.status}`); let data: any; try { data = JSON.parse(txt) } catch { throw new Error('Invalid JSON') } const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv')); setSelectedHistory(mapped); setShowPreviewDialog(true); } catch { toast.error('Failed to load analysis JSON (preview)'); } }}>Preview</Button>
                        <Button size="sm" className="rounded-lg font-semibold px-4 py-2 shadow transition-colors duration-150" style={{ minWidth: 64, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', color: '#fff', border: '1px solid #2563eb' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1d4ed8'; e.currentTarget.style.borderColor = '#1e40af'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.borderColor = '#2563eb'; }} onClick={async (e) => {
                          // Show fullscreen spinner overlay
                          const overlay = document.createElement('div');
                          overlay.style.position = 'fixed';
                          overlay.style.top = '0';
                          overlay.style.left = '0';
                          overlay.style.width = '100vw';
                          overlay.style.height = '100vh';
                          overlay.style.background = 'rgba(30, 41, 59, 0.35)';
                          overlay.style.zIndex = '9999';
                          overlay.style.display = 'flex';
                          overlay.style.alignItems = 'center';
                          overlay.style.justifyContent = 'center';
                          overlay.innerHTML = `<div style='display:flex;flex-direction:column;align-items:center;gap:1rem;'><svg class='animate-spin' width='64' height='64' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'><circle cx='24' cy='24' r='20' stroke='white' stroke-width='4' opacity='0.15'/><circle cx='24' cy='24' r='20' stroke='white' stroke-width='4' stroke-dasharray='125.6' stroke-dashoffset='94.2' stroke-linecap='round'/></svg><span style='color:white;font-size:1.25rem;font-weight:500;'>Loading analysis...</span></div>`;
                          document.body.appendChild(overlay);
                          try {
                            const href = row.analysis_json_url;
                            const res = await fetch(href, { cache: 'no-store' });
                            const txt = await res.text();
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            let data;
                            try { data = JSON.parse(txt); } catch { throw new Error('Invalid JSON'); }
                            const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv'));
                            onViewHistory?.(mapped);
                            onOpenChange(false);
                          } catch { toast.error('Failed to open analysis (JSON)'); }
                          document.body.removeChild(overlay);
                        }}><span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', letterSpacing: '0.01em' }}>Open</span></Button>
                        <Button size="sm" variant="outline" className="rounded-lg flex items-center gap-1 transition-colors duration-150" style={{ border: '1px solid #e5e7eb', color: '#2563eb', backgroundColor: '#fff' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#1d4ed8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#2563eb'; }} onClick={() => performDownload(row)}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/></svg><span>PDF</span></Button>
                        <Button size="sm" variant="destructive" className="rounded-lg flex items-center gap-1 transition-colors duration-150" style={{ backgroundColor: '#ef4444', color: '#fff', border: '1px solid #ef4444' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#b91c1c'; e.currentTarget.style.borderColor = '#991b1b'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }} onClick={() => { setConfirmDeleteId(row.id); setConfirmDeleteRow(row); }}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6m3 6v6m4-6v6"/></svg></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="ml-2">Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) { setConfirmDeleteId(null); setConfirmDeleteRow(null); } }}>
        <DialogContent className="max-w-xs" style={{ width: '320px', minWidth: '220px', padding: '1.25rem' }}>
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

      {selectedHistory && (
        <PDFPreviewDialog isOpen={showPreviewDialog} onClose={() => setShowPreviewDialog(false)} result={selectedHistory} />
      )}
    </>
  );
}
