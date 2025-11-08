// Frontend service to call backend analyze API with retry and response mapping
import type { AnalysisResult } from '../App';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5000';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, tries = 2, timeoutMs = 90000): Promise<Response> {
  let attempt = 0;
  let lastErr: any;
  while (attempt <= tries) {
    try {
      const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), timeoutMs);
      const resp = await fetch(input, { ...init, signal: ac.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
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

function toLabel(score: number): AnalysisResult['fairnessLabel'] {
  return score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : score >= 40 ? 'Poor' : 'Critical';
}

function toRisk(score: number): AnalysisResult['biasRisk'] {
  return score >= 70 ? 'Low' : score >= 55 ? 'Moderate' : score >= 40 ? 'High' : 'Critical';
}

export async function analyzeDataset(
  file: File,
  opts: { runGemini: boolean; returnPlots: 'none' | 'json' | 'png' | 'both' } = { runGemini: false, returnPlots: 'json' }
): Promise<AnalysisResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('run_gemini', String(opts.runGemini));
  form.append('return_plots', opts.returnPlots);

  const res = await fetchWithRetry(`${BACKEND_URL}/api/analyze`, { method: 'POST', body: form }, 1, 90000);
  const data = await res.json();

  const fairnessScore = Number(data.fairness_score ?? data.dataset_summary?.fairness_score ?? 0);
  const fairnessLabel = toLabel(fairnessScore);
  const biasRisk = toRisk(fairnessScore);
  const reliabilityRaw = String(data.reliability?.reliability_level || 'moderate').toLowerCase();
  const reliabilityLevel: AnalysisResult['reliabilityLevel'] = reliabilityRaw === 'high' ? 'High' : reliabilityRaw === 'low' ? 'Low' : 'Moderate';
  const reliabilityMessage: string | undefined = data.reliability?.message;

  const mappedBiasesGroups = data.mapped_biases?.bias_types || {};
  // Normalize AI explanations ensuring non-empty readable text; if backend provided bullets, reconstruct markdown list
  const flattenedBiases = Object.entries(mappedBiasesGroups).flatMap(([type, arr]: any) =>
    (arr || []).map((b: any, idx: number) => {
      const rawAi = (b.ai_explanation ?? '').toString().trim();
      const desc = (b.description ?? '').toString().trim();
      const bullets: string[] = Array.isArray(b.ai_explanation_bullets) ? b.ai_explanation_bullets : [];
      let ai = rawAi && rawAi.toLowerCase() !== 'none' && rawAi.length > 5 ? rawAi : (desc || 'No AI explanation available.');
      // If ai does not contain any markdown header but bullets exist, build a synthetic explanation block
      if (bullets.length && !/^#{2,6}\s/.test(ai)) {
        const headerGuess = `#### ${type}: \`${b.feature || 'feature'}\``;
        const bulletBlock = bullets.map(bt => `* ${bt}`).join('\n');
        ai = `${headerGuess}\n${bulletBlock}`.trim();
      }
      return {
        id: `${type}-${idx}`,
        bias_type: type,
        column: b.feature || 'unknown',
        severity: (b.severity || 'Moderate') as any,
        description: desc,
        ai_explanation: ai,
        definition: type,
      };
    })
  );

  const ds = data.numeric_summary || {};
  const overall = data.summary || data.dataset_summary || '';
  const plots = (data.plots && typeof data.plots === 'object') ? data.plots : undefined;
  const overallMapped = data.mapped_biases?.overall || {};
  const recs: string[] = overallMapped.actionable_recommendations || [];
  const conclusion: string = overallMapped.conclusion || 'No conclusion available.';
  const fairnessAssess: string = overallMapped.fairness || overallMapped.assessment || overall || 'Fairness assessment unavailable.';

  const result: AnalysisResult = {
    id: `analysis-${Date.now()}`,
    datasetName: file.name,
    uploadDate: new Date().toISOString(),
    status: 'complete',
    dataset: {
      rows: Number(ds.n_rows || ds.rows || 0),
      columns: Number(ds.n_columns || ds.columns || 0),
      mean: Number(ds.mean || 0),
      median: Number(ds.median || 0),
      mode: Number(ds.mode || 0),
      max: Number(ds.max || 0),
      min: Number(ds.min || 0),
      stdDev: Number(ds.std_dev || ds.stdDev || 0),
      variance: Number(ds.variance || 0),
    },
    fairnessScore,
    fairnessLabel,
    biasRisk,
    reliabilityLevel,
  reliabilityMessage,
    overallMessage: String(overall || 'Analysis complete.'),
    detectedBiases: flattenedBiases,
    assessment: {
      fairness: fairnessAssess,
      recommendations: recs.length ? recs : [reliabilityLevel === 'High' ? 'Maintain current data collection practices.' : 'Review data collection for potential sampling bias.', 'Implement periodic fairness audits.'],
      conclusion: conclusion || (reliabilityLevel === 'High' ? 'Dataset appears fair.' : 'Further review recommended.'),
    },
    distributions: [],
    rawBiasReport: Array.isArray(data.bias_report) ? data.bias_report : [],
    plots,
  };

  return result;
}
