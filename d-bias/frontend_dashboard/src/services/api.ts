// Cancel the current analysis job on the backend
export async function cancelAnalysis(): Promise<{ status: string; cleanup_error?: string }> {
  const res = await fetch(
    `${BACKEND_URL}/api/cancel-analysis`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
  );
  const data = await res.json();
  return data;
}
// Frontend service to call backend analyze API with retry and response mapping
import type { AnalysisResult } from '../App';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5000';
const SUPABASE_BUCKET_ANALYSIS_JSON = (import.meta as any).env?.VITE_SUPABASE_BUCKET_ANALYSIS_JSON || 'analysis_json';
const SUPABASE_BUCKET_PDF_BIAS_REPORTS = (import.meta as any).env?.VITE_SUPABASE_BUCKET_PDF_BIAS_REPORTS || 'pdf_bias_reports';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Abort-aware delay: rejects with AbortError if signal aborts during wait
async function abortableDelay(ms: number, signal?: AbortSignal) {
  if (!signal) return delay(ms);
  if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  return new Promise<void>((resolve, reject) => {
    const tid = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    const cleanup = () => {
      clearTimeout(tid);
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  tries = 2,
  timeoutMs = 90000,
  okRequired: boolean = true,
  externalSignal?: AbortSignal,
): Promise<Response> {
  let attempt = 0;
  let lastErr: any;
  while (attempt <= tries) {
    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), timeoutMs);
      let externalAbortHandler: any = null;
      if (externalSignal) {
        if (externalSignal.aborted) ac.abort();
        externalAbortHandler = () => ac.abort();
        externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
      }
      const resp = await fetch(input, { ...init, signal: ac.signal });
      clearTimeout(timeout);
      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener('abort', externalAbortHandler);
      }
      if (okRequired && !resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${txt}`);
      }
      return resp;
    } catch (e: any) {
      lastErr = e;
      if (attempt === tries) break;
      await delay(500 * Math.pow(2, attempt));
      attempt++;
    }
  }
  throw lastErr || new Error('Network error');
}

// Parse numbered markdown list into array items while preserving item text
function parseRecommendations(text: string): string[] {
  const src = String(text || '').trim();
  if (!src) return [];
  const items: string[] = [];
  const re = /(^|\n)\s*\d+\.\s+([\s\S]*?)(?=(\n\s*\d+\.\s)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const item = (m[2] || '')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (item) items.push(item);
  }
  // Fallback: if regex found nothing, try splitting by bullet lines while keeping content
  if (!items.length) {
    const rough = src.split(/\n+\s*(?:[-*•]|\d+\.)\s+/).map(s => s.trim()).filter(Boolean);
    return rough.length ? rough : [src];
  }
  return items;
}

// Remove global sections (summary/reliability/recommendations) from a bias-level explanation
function sanitizeAiExplanation(text: string, fallback?: string): string {
  const src = String(text || '');
  if (!src.trim()) return String(fallback || '').trim();
  const patterns: RegExp[] = [
    /(^|\n)\s*#{0,6}\s*\**\s*Summary\s*(?:&|and)\s*Recommendations\s*\**\s*:?/i,
    /(^|\n)\s*#{0,6}\s*\**\s*Overall\s+Reliability\s+Assessment\s*\**\s*:?/i,
    /(^|\n)\s*#{0,6}\s*\**\s*Fairness\s*&\s*Ethical\s*Implications\s*\**\s*:?/i,
    /(^|\n)\s*#{0,6}\s*\**\s*Concluding\s+Summary\s*\**\s*:?/i,
    /(^|\n)\s*#{0,6}\s*\**\s*Actionable\s+Recommendations\s*\**\s*:?/i,
  ];
  let cutAt = -1;
  for (const re of patterns) {
    const idx = src.search(re);
    if (idx >= 0) cutAt = cutAt === -1 ? idx : Math.min(cutAt, idx);
  }
  const trimmed = (cutAt >= 0 ? src.slice(0, cutAt) : src).trim();
  return trimmed || String(fallback || '').trim();
}

// Canonical mapper: derive AnalysisResult strictly from analysis_response.json keys
export function mapAnalysisFromJson(data: any, datasetName: string): AnalysisResult {
  // If the stored JSON is already an AnalysisResult shape, normalize and return it directly
  if (data && typeof data === 'object' && ('fairnessScore' in data || 'detectedBiases' in data)) {
    const ar = data as Partial<AnalysisResult> as AnalysisResult;
    ar.datasetName = (ar.datasetName || datasetName || 'dataset.csv').toString();
    ar.uploadDate = ar.uploadDate || new Date().toISOString();
    ar.status = (ar.status as any) || 'complete';
    ar.dataset = ar.dataset || {
      rows: Number((data as any)?.dataset?.rows ?? 0),
      columns: Number((data as any)?.dataset?.columns ?? 0),
      mean: Number((data as any)?.dataset?.mean ?? 0),
      median: Number((data as any)?.dataset?.median ?? 0),
      mode: Number((data as any)?.dataset?.mode ?? 0),
      max: Number((data as any)?.dataset?.max ?? 0),
      min: Number((data as any)?.dataset?.min ?? 0),
      stdDev: Number((data as any)?.dataset?.stdDev ?? 0),
      variance: Number((data as any)?.dataset?.variance ?? 0),
    };
    ar.assessment = ar.assessment || { fairness: '', recommendations: [], conclusion: '' };
    ar.detectedBiases = Array.isArray(ar.detectedBiases) ? ar.detectedBiases : [];
    return ar;
  }
  const fairnessScore = Number(data?.fairness_score ?? 0);
  const fairnessLabel = toLabel(fairnessScore);
  const biasRisk = toRisk(fairnessScore);

  const reliabilityRaw = String(data?.reliability?.reliability_level || '').toLowerCase();
  const reliabilityLevel: AnalysisResult['reliabilityLevel'] =
    reliabilityRaw === 'high' ? 'High' : reliabilityRaw === 'low' ? 'Low' : 'Moderate';
  const reliabilityMessage: string | undefined = data?.reliability?.message;

  const ns = data?.numeric_summary || {};
  const overall = (data?.summary ?? '').toString();
  const plots = data && typeof data.plots === 'object' ? data.plots : undefined;

  // Bias cards from mapped_biases[]; enrich with bias_report Type/Feature by index from bias_id
  const biasReport: any[] = Array.isArray(data?.bias_report) ? data.bias_report : [];
  const detectedBiases = Array.isArray(data?.mapped_biases)
    ? (data.mapped_biases as any[]).map((mb: any) => {
        const id = String(mb.bias_id || '').trim();
        const idx = (() => {
          const m = id.match(/(\d{4})$/);
          return m ? Math.max(0, parseInt(m[1], 10) - 1) : -1;
        })();
        const raw = idx >= 0 && idx < biasReport.length ? biasReport[idx] : null;
        const type = (raw?.Type ?? raw?.type ?? '').toString();
        const feature = (raw?.Feature ?? raw?.feature ?? '').toString();
        const sev = (mb.severity ?? raw?.Severity ?? raw?.severity ?? '').toString();
        const desc = (mb.description ?? raw?.Description ?? raw?.description ?? '').toString();
        const ai = sanitizeAiExplanation((mb.ai_explanation ?? '').toString(), desc);
        return {
          id: id || `bias-${idx >= 0 ? idx : Date.now()}`,
          bias_type: type || '',
          column: feature || '',
          severity: (sev || 'Moderate') as AnalysisResult['detectedBiases'][number]['severity'],
          description: desc,
          ai_explanation: ai,
          definition: type || '',
        };
      })
    : [];

  const assessmentFairness = (data?.fairness_ethics ?? data?.overall_reliability_assessment ?? '').toString();
  const assessmentConclusion = (data?.concluding_summary ?? '').toString();
  const assessmentRecs = parseRecommendations((data?.actionable_recommendations ?? '').toString());
  const totalBiases = Number(data?.total_biases ?? (Array.isArray(data?.mapped_biases) ? data.mapped_biases.length : 0));
  const severitySummary = (data?.severity_summary && typeof data.severity_summary === 'object') ? data.severity_summary : undefined;

  return {
    id: `analysis-${Date.now()}`,
    datasetName,
    uploadDate: new Date().toISOString(),
    status: 'complete',
    dataset: {
      // Support both numeric_summary.{rows,columns} and legacy {n_rows,n_columns}; prefer explicit rows/columns
      rows: Number((ns as any)?.rows ?? (ns as any)?.n_rows ?? data?.reliability?.n_rows ?? 0),
      columns: Number((ns as any)?.columns ?? (ns as any)?.n_columns ?? data?.reliability?.n_columns ?? 0),
      mean: Number(ns?.mean ?? 0),
      median: Number(ns?.median ?? 0),
      mode: Number(ns?.mode ?? 0),
      max: Number(ns?.max ?? 0),
      min: Number(ns?.min ?? 0),
      stdDev: Number(ns?.std_dev ?? 0),
      variance: Number(ns?.variance ?? 0),
    },
    fairnessScore,
    fairnessLabel,
    biasRisk,
    reliabilityLevel,
    reliabilityMessage,
    overallMessage: overall,
    totalBiases,
    severitySummary,
    detectedBiases,
    assessment: {
      fairness: assessmentFairness,
      recommendations: assessmentRecs,
      conclusion: assessmentConclusion,
    },
    distributions: [],
    rawBiasReport: biasReport,
    plots,
  } as AnalysisResult;
}

function toLabel(score: number): AnalysisResult['fairnessLabel'] {
  return score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : score >= 40 ? 'Poor' : 'Critical';
}

function toRisk(score: number): AnalysisResult['biasRisk'] {
  return score >= 70 ? 'Low' : score >= 55 ? 'Moderate' : score >= 40 ? 'High' : 'Critical';
}

export async function analyzeDataset(
  file: File,
  opts: { runGemini: boolean; returnPlots: 'none' | 'json' | 'png' | 'both' } = { runGemini: true, returnPlots: 'json' },
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('run_gemini', String(opts.runGemini));
  form.append('return_plots', opts.returnPlots);

  const res = await fetchWithRetry(
    `${BACKEND_URL}/api/analyze`,
    { method: 'POST', body: form },
    1,
    1200000,
    true,
    signal,
  );
  const data = await res.json();
  return mapAnalysisFromJson(data, file.name);
}

// Simple client-side throttle to avoid burst hitting Gemini/server from the UI.
// Controlled by env var VITE_ANALYZE_MIN_INTERVAL_MS (default 3000ms).
const MIN_ANALYZE_INTERVAL_MS = Number((import.meta as any).env?.VITE_ANALYZE_MIN_INTERVAL_MS ?? 3000);
let lastAnalyzeAt = 0;

export async function analyzeDatasetThrottled(
  file: File,
  opts: { runGemini: boolean; returnPlots: 'none' | 'json' | 'png' | 'both' } = { runGemini: true, returnPlots: 'json' },
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const now = Date.now();
  const waitMs = Math.max(0, lastAnalyzeAt + MIN_ANALYZE_INTERVAL_MS - now);
  if (waitMs > 0) {
    await abortableDelay(waitMs, signal);
  }
  lastAnalyzeAt = Date.now();
  return analyzeDataset(file, opts, signal);
}

// Fetch the latest cached analysis JSON from backend without uploading a file.
// Useful for quickly loading a previously generated report stored as analysis_response.json.
export async function fetchLatestCachedAnalysis(signal?: AbortSignal): Promise<AnalysisResult | null> {
  // Allow non-OK so we can treat 404 (no cache yet) distinctly.
  let res: Response;
  try {
    res = await fetchWithRetry(
      `${BACKEND_URL}/api/analysis/latest`,
      { method: 'GET' },
      1,
      15000,
      false,
      signal,
    );
  } catch (e: any) {
    // Network / abort -> surface as null (silent) so UI can decide to show button still
    return null;
  }
  if (res.status === 404) {
    // No cached analysis file yet; return null so caller can show friendly message.
    return null;
  }
  if (!res.ok) {
    // Other error codes: propagate as null.
    return null;
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    return null;
  }
  // Use canonical mapper for cached loads as well
  const datasetName = (data?.dataset_name || 'cached_dataset.csv').toString();
  return mapAnalysisFromJson(data, datasetName);
}

// Shape returned by backend /api/upload on success
export type UploadInfo = {
  rows: number;
  cols: number;
  columns: string[];
  preprocessing_warnings?: unknown;
};

// Simple profile helpers with network-first, localStorage fallback so the UI works
export type Profile = {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
};

// Create or update profile via backend; if backend is unavailable, persist to localStorage
export async function createProfile(p: Profile): Promise<Profile> {
  try {
    const res = await fetchWithRetry(`${BACKEND_URL}/api/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }, 1, 30000, false);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    try { localStorage.setItem('d-bias-profile', JSON.stringify(data)); } catch {}
    return data;
  } catch (e) {
    // fallback to local storage
    const stored = { id: 'local', ...p } as Profile;
    try { localStorage.setItem('d-bias-profile', JSON.stringify(stored)); } catch {}
    return stored;
  }
}

export async function getProfile(): Promise<Profile | null> {
  try {
    const res = await fetchWithRetry(`${BACKEND_URL}/api/profile`, { method: 'GET' }, 1, 15000, false);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data as Profile;
  } catch (e) {
    try {
      const raw = localStorage.getItem('d-bias-profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function updateProfile(id: string | undefined, p: Profile): Promise<Profile> {
  try {
    const path = id ? `${BACKEND_URL}/api/profile/${encodeURIComponent(id)}` : `${BACKEND_URL}/api/profile`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetchWithRetry(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }, 1, 30000, false);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    try { localStorage.setItem('d-bias-profile', JSON.stringify(data)); } catch {}
    return data;
  } catch (e) {
    const stored = { id: id ?? 'local', ...p } as Profile;
    try { localStorage.setItem('d-bias-profile', JSON.stringify(stored)); } catch {}
    return stored;
  }
}

export async function deleteProfile(id: string | undefined): Promise<void> {
  try {
    if (id) {
      await fetchWithRetry(`${BACKEND_URL}/api/profile/${encodeURIComponent(id)}`, { method: 'DELETE' }, 1, 15000, false);
    } else {
      await fetchWithRetry(`${BACKEND_URL}/api/profile`, { method: 'DELETE' }, 1, 15000, false);
    }
  } catch (e) {
    // ignore network errors for delete and clear local storage
  }
  try { localStorage.removeItem('d-bias-profile'); } catch {}
}

// Upload a dataset for quick validation/metadata without full analysis
export async function uploadDataset(file: File): Promise<UploadInfo> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithRetry(
    `${BACKEND_URL}/api/upload`,
    { method: 'POST', body: form },
    1,
    30000,
    false
  );

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore JSON parse errors
  }

  if (!res.ok) {
    const reasons: string[] = Array.isArray(data?.reasons) ? data.reasons : [];
    const baseMsg = typeof data?.error === 'string' ? data.error : 'Upload validation failed';
    const msg = reasons.length ? `${baseMsg}: ${reasons.join('; ')}` : baseMsg;
    const err = new Error(msg) as Error & { reasons?: string[] };
    if (reasons.length) err.reasons = reasons;
    throw err;
  }

  return {
    rows: Number(data?.rows ?? 0),
    cols: Number(data?.cols ?? 0),
    columns: Array.isArray(data?.columns) ? data.columns.map((c: any) => String(c)) : [],
    preprocessing_warnings: data?.preprocessing_warnings,
  } as UploadInfo;
}
