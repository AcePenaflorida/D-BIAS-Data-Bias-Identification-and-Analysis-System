import { supabase } from '../lib/supabase';
import { getCurrentUser } from './auth';
import { uploadFile, generateAnalysisPdfBlob } from './storage';
import type { AnalysisResult } from '../App';
import { mapAnalysisFromJson } from './api';
const BUCKET_JSON = (import.meta as any).env?.VITE_SUPABASE_BUCKET_ANALYSIS_JSON || 'analysis_json';
const BUCKET_PDF = (import.meta as any).env?.VITE_SUPABASE_BUCKET_PDF_BIAS_REPORTS || 'pdf_bias_reports';

export type NewAnalysis = {
  report_url?: string | null;
  analysis_json_url?: string | null;
  description?: string | null;
};

export async function saveAnalysis(a: NewAnalysis) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('analysis')
    .insert({ user_id: user.id, report_url: a.report_url ?? null, analysis_json_url: a.analysis_json_url ?? null, description: a.description ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listAnalysesByUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('analysis')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Permanently delete an analysis row and associated storage objects (best-effort)
export async function deleteAnalysis(id: number, row?: any) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  let target = row;
  if (!target) {
    const { data, error } = await supabase
      .from('analysis')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    target = data;
  }

  const urls: string[] = [];
  if (target?.analysis_json_url) urls.push(String(target.analysis_json_url));
  if (target?.report_url) urls.push(String(target.report_url));

  // Parse Supabase public storage URL pattern: /storage/v1/object/public/<bucket>/<path>
  function parsePublicUrl(u: string): { bucket: string; path: string } | null {
    try {
      const url = new URL(u);
      const parts = url.pathname.split('/').filter(Boolean);
      const publicIdx = parts.indexOf('public');
      if (publicIdx >= 0 && parts[publicIdx + 1]) {
        const bucket = parts[publicIdx + 1];
        const path = parts.slice(publicIdx + 2).join('/');
        if (bucket && path) return { bucket, path };
      }
    } catch {}
    return null;
  }

  for (const u of urls) {
    const parsed = parsePublicUrl(u);
    if (parsed) {
      try { await supabase.storage.from(parsed.bucket).remove([parsed.path]); } catch {}
    }
  }

  const { error: delError } = await supabase.from('analysis').delete().eq('id', id);
  if (delError) throw delError;
  return true;
}

export async function ensureUserProfile(username?: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const uname = (username && username.trim()) || user.email?.split('@')[0] || 'user';
  const { data, error } = await supabase
    .from('users')
    .upsert({ user_id: user.id, username: uname }, { onConflict: 'username' })
    .select('*')
    .single();
  if (error) return null;
  return data;
}

export async function logSession(action: string, ip_address?: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('session_log')
    .insert({ user_id: user.id, action, ip_address: ip_address ?? null })
    .select('*')
    .single();
  if (error) return null;
  return data;
}

// Orchestrate persistence: upload JSON/PDF then save row in public.analysis
export async function persistAnalysisResult(result: AnalysisResult, description?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const ts = new Date(result.uploadDate || Date.now()).toISOString().replace(/[:.]/g, '-');
  const base = sanitizePathPart(result.datasetName || 'dataset');
  const rid = Math.random().toString(36).slice(2, 8);
  const basePath = `${user.id}/${ts}_${base}_${rid}`;

  const jsonBlob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const jsonPath = `${basePath}.json`;

  // 1) Upload JSON
  let jsonUrl: string | null = null;
  try {
    jsonUrl = await uploadFile(BUCKET_JSON, jsonPath, jsonBlob, 'application/json');
  } catch (e: any) {
    throw new Error('JSON upload failed: ' + (e?.message || String(e)));
  }

  // 2) Generate and upload PDF
  const pdfPath = `${basePath}.pdf`;
  let pdfUrl: string | null = null;
  try {
    const pdfBlob = await generateAnalysisPdfBlob(result);
    pdfUrl = await uploadFile(BUCKET_PDF, pdfPath, pdfBlob, 'application/pdf');
  } catch (e: any) {
    // Roll back JSON for atomicity
    try { await supabase.storage.from(BUCKET_JSON).remove([jsonPath]); } catch {}
    throw new Error('PDF upload failed: ' + (e?.message || String(e)));
  }

  // 3) Insert DB row only when both uploads succeeded
  const row = await saveAnalysis({ analysis_json_url: jsonUrl, report_url: pdfUrl, description: description ?? result.datasetName });
  return row;
}

// Load saved analyses: fetch rows and hydrate from stored JSON (uploaded as AnalysisResult)
export async function loadSavedAnalyses(): Promise<AnalysisResult[]> {
  const rows = await listAnalysesByUser();
  const results: AnalysisResult[] = [];
  for (const r of rows) {
    const href = (r as any).analysis_json_url as string | null;
    if (!href) continue; // row was saved but JSON upload failed
    try {
      const res = await fetch(href, { cache: 'no-store' });
      if (!res.ok) {
        // Log missing/deleted file once for debugging, but skip to avoid log spam
        if (res.status === 400 || res.status === 404) {
          console.warn(`[loadSavedAnalyses] Skipping missing/deleted Supabase file: ${href} (status ${res.status})`);
        }
        continue;
      }
      const data = await res.json();
      if (data && typeof data === 'object') {
        const datasetName = ((r as any).description || (data?.dataset_name) || 'saved_analysis.csv').toString();
        const mapped = mapAnalysisFromJson(data, datasetName);
        // Ensure stable id linkage to the row
        mapped.id = mapped.id || `analysis-${(r as any).id}`;
        results.push(mapped);
      }
    } catch (err) {
      // Log fetch error once for debugging, but skip to avoid log spam
      console.warn(`[loadSavedAnalyses] Error loading Supabase file: ${href}`, err);
    }
  }
  // Sort newest first by uploadDate if present
  results.sort((a, b) => +new Date(b.uploadDate || 0) - +new Date(a.uploadDate || 0));
  return results;
}

function sanitizePathPart(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'dataset';
}
