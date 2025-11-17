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
              <DialogTitle className="flex items-center justify-between">
                <span className="flex-1 text-center">Analysis History</span>
                <div className="absolute right-0 top-0 mt-1 mr-1">
                  <Button variant="outline" size="sm" onClick={async () => { try { await onRefreshHistory?.(); toast.success('History refreshed'); } catch { toast.error('Failed to refresh history'); } }}>Refresh</Button>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 mt-3" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Filter & Sort controls */}
              <div className="space-y-2 px-1">
                <Input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Search description..." className="bg-white" />
                <div className="flex flex-wrap gap-2">
                  <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} className="bg-white text-sm border rounded-md px-2 py-1">
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="az">A–Z</option>
                    <option value="za">Z–A</option>
                  </select>
                  {filterText && (<Button variant="ghost" size="sm" onClick={() => setFilterText('')}>Clear</Button>)}
                </div>
              </div>

              {loading && <p className="text-xs text-slate-500 px-2">Loading...</p>}

              {!isAuthenticated ? (
                <div className="p-6 text-center">
                  <p className="text-slate-700 mb-3">Please log in to view your analysis history.</p>
                  <div className="flex justify-center">
                    <button className="px-3 py-2 bg-blue-600 text-white rounded-md" onClick={() => { onLogin?.(); onOpenChange(false); }}>Login</button>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-slate-500">No analysis history yet</p>
                  <Button variant="outline" size="sm" onClick={async () => { try { const latest = await fetchLatestCachedAnalysis(); if (!latest) { toast.error('No cached analysis found'); return; } setSelectedHistory(latest); setShowPreviewDialog(true); } catch { toast.error('Failed to load cached analysis'); } }}>Load Latest Cached</Button>
                </div>
              ) : (
                <div className="w-full" style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  {filtered.map((row) => (
                    <div key={row.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors mb-4 flex flex-col gap-2" style={{ minWidth: '320px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button onClick={() => togglePin(row.id)} title={pinnedIds.has(row.id) ? 'Unpin' : 'Pin'} className={`p-1 rounded-full border-none bg-transparent focus:outline-none ${pinnedIds.has(row.id) ? 'text-blue-600' : 'text-slate-400'} hover:text-blue-500`} style={{ minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ display: 'block' }}><path d="M7.5 2a2.5 2.5 0 0 1 5 0v2.09c0 .36.19.7.5.88l3.13 1.88a1 1 0 0 1-.08 1.76l-3.05 1.53a1 1 0 0 0-.55.89V17a1 1 0 0 1-2 0v-5.97a1 1 0 0 0-.55-.89l-3.05-1.53a1 1 0 0 1-.08-1.76l3.13-1.88a1 1 0 0 0 .5-.88V2z" /></svg>
                          </button>
                          <span className="font-semibold text-slate-900 text-base truncate" style={{ maxWidth: '260px', display: 'inline-block', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description || 'analysis'}>{row.description || 'analysis'}</span>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 shrink-0">saved</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span className="font-mono">{new Date(row.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                      </div>

                      <div className="flex flex-row gap-2 items-center mb-1 flex-wrap">
                        <Button variant="outline" size="sm" onClick={async () => { try { const href: string = row.analysis_json_url; const res = await fetch(href, { cache: 'no-store' }); const txt = await res.text(); if (!res.ok) throw new Error(`HTTP ${res.status}`); let data: any; try { data = JSON.parse(txt) } catch { throw new Error('Invalid JSON') } const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv')); setSelectedHistory(mapped); setShowPreviewDialog(true); } catch { toast.error('Failed to load analysis JSON (preview)'); } }}>Preview</Button>

                        <Button size="sm" onClick={async () => { try { const href: string = row.analysis_json_url; const res = await fetch(href, { cache: 'no-store' }); const txt = await res.text(); if (!res.ok) throw new Error(`HTTP ${res.status}`); let data: any; try { data = JSON.parse(txt) } catch { throw new Error('Invalid JSON') } const mapped = mapAnalysisFromJson(data, String(row.description || 'analysis.csv')); onViewHistory?.(mapped); onOpenChange(false); } catch { toast.error('Failed to open analysis (JSON)'); } }} className="bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 focus:bg-blue-700 font-semibold px-4 py-2 rounded shadow" style={{ minWidth: 64, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backgroundColor: '#2563eb', border: '1px solid #2563eb' }}><span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', letterSpacing: '0.01em' }}>Open</span></Button>

                        <Button size="sm" variant="outline" onClick={() => performDownload(row)} className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/></svg><span>Download PDF</span></Button>

                        <Button size="sm" variant="destructive" onClick={() => { setConfirmDeleteId(row.id); setConfirmDeleteRow(row); }} className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg><span>Delete</span></Button>
                      </div>

                      <div className="flex gap-3 text-xs mt-1 text-slate-600 flex-wrap"><a className="underline" href={row.analysis_json_url} target="_blank" rel="noreferrer">JSON</a><a className="underline" href={row.report_url} target="_blank" rel="noreferrer">PDF</a></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      {selectedHistory && (
        <PDFPreviewDialog isOpen={showPreviewDialog} onClose={() => setShowPreviewDialog(false)} result={selectedHistory} />
      )}
    </>
  );
}
