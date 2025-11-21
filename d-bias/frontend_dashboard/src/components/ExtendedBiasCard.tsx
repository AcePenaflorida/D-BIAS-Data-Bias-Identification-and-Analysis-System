import { useState } from 'react';
import { Card } from './ui/card';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface ExtendedBiasCardProps {
  bias: {
    id: string;
    bias_type: string;
    column: string;
    severity: string;
    description: string;
    ai_explanation?: string;
  };
}

// Extract structured sections from AI explanation markdown-ish text.
function extractSections(text: string) {
  const sections: Record<string, string[]> = {
    Meaning: [],
    Harm: [],
    Impact: [],
    'Severity Explanation': [],
    Fix: [],
  };
  if (!text) return sections;
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00A0]/g, ' ')
    .split(/\n/)
    .map(l => l.trim())
    .filter(Boolean);
  let current: keyof typeof sections | null = null;
  for (const raw of lines) {
    // Match header lines like "Meaning:", "Meaning: text", or just "Meaning" on its own line.
    const hdr = raw.match(/^(Meaning|Harm|Impact|Severity\s*(?:Explanation|Rationale)?|Fix|Mitigation|Recommendations?)\s*:?\s*(.*)$/i);
    if (hdr) {
      const key = hdr[1] as string;
      const label = key.toLowerCase();
      current = (label.startsWith('severity') ? 'Severity Explanation' : label.startsWith('mitigation') || label.startsWith('recommend') ? 'Fix' : (hdr[1] as keyof typeof sections)) as keyof typeof sections;
      const rest = (hdr[2] || '').trim();
      if (rest) sections[current].push(rest);
      continue;
    }
    if (current) sections[current].push(raw);
  }
  return sections;
}

// Safe formatter for AI explanation content: remove hashtags, escape HTML, convert **bold** to <strong>.
const formatExplanation = (s: string) => {
  if (!s) return '';
  let cleaned = String(s).replace(/#+/g, '');
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  cleaned = escapeHtml(cleaned);
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return cleaned;
};

// Block formatter: preserves paragraphs and line breaks for long, unstructured text.
const formatExplanationBlock = (s: string) => {
  if (!s) return '';
  let cleaned = String(s).replace(/#+/g, '');
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  cleaned = escapeHtml(cleaned);
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Convert multiple blank lines into paragraph breaks, single newlines to <br/>
  cleaned = cleaned.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>');
  return `<p>${cleaned}</p>`;
};

function renderSection(title: string, bodyLines?: string[] | string) {
  if (!bodyLines || (Array.isArray(bodyLines) && bodyLines.length === 0)) return null;
  const lines = Array.isArray(bodyLines) ? bodyLines : String(bodyLines).split(/\n+/);
  const cleaned = lines.map(l => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const asList = cleaned.every(l => /^[-*•]|^\d+\./.test(l));
  return (
    <section className="space-y-3">
      <h5 className="text-slate-800 text-base font-semibold">{title}</h5>
      {asList ? (
        <ul className="list-disc ml-6 space-y-2 text-slate-700 text-sm">
          {cleaned.map((l, i) => (
            <li key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: formatExplanation(l.replace(/^[-*•]\s*/, '')) }} />
          ))}
        </ul>
      ) : (
        cleaned.map((l, i) => (
          <p key={i} className="text-slate-700 text-sm pl-4 leading-relaxed" style={{ textAlign: 'justify' }} dangerouslySetInnerHTML={{ __html: formatExplanation(l) }} />
        ))
      )}
    </section>
  );
}

function renderMetaBullets(label: string, items: Array<{ label: string; value?: string }>) {
  const visible = items.filter(i => (i.value ?? '').toString().trim().length > 0);
  if (!visible.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-slate-800 text-sm font-semibold">{label}</div>
      <dl className="grid grid-cols-1 gap-y-2 text-slate-700 text-sm">
        {visible.map((i, idx) => (
          <div key={idx} className="flex gap-3 items-start">
            <dt className="w-28 text-slate-800 font-semibold">{i.label}:</dt>
            <dd className="flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatExplanation(String(i.value)) }} />
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ExtendedBiasCard({ bias }: ExtendedBiasCardProps) {
  const [open, setOpen] = useState(false);
  const sections = extractSections(bias.ai_explanation || '');
  // Filter out trivial Severity Explanation entries that only repeat the severity label
  const filteredSections = { ...sections } as Record<string, string[]>;
  try {
    const sev = (bias.severity || '').toString().trim().toLowerCase();
    const sevText = (filteredSections['Severity Explanation'] || []).join(' ').trim().toLowerCase();
    if (!sevText || sevText === sev || /^(low|moderate|high|critical)$/.test(sevText)) {
      filteredSections['Severity Explanation'] = [];
    }
  } catch (e) {
    /* ignore and keep sections as-is */
  }
  const hasStructured = Object.values(filteredSections).some(arr => arr.length);

  const getSeverityColor = (severity?: string) => {
    switch ((severity || '').toLowerCase()) {
      case 'low':
        return 'bg-green-50 text-green-800 ring-1 ring-green-200';
      case 'moderate':
        return 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200';
      case 'high':
        return 'bg-red-50 text-red-800 ring-1 ring-red-200';
      case 'critical':
        return 'bg-red-100 text-red-900 ring-1 ring-red-300';
      default:
        return 'bg-slate-50 text-slate-700 ring-1 ring-slate-200';
    }
  };

  return (
    <Card
      className="p-5 space-y-3 cursor-pointer"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen(o => !o)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(o => !o);
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-slate-900 mb-1 truncate" title={bias.bias_type}>{bias.bias_type}</h4>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Bias definition"
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" sideOffset={12} className="max-w-sm">
                  <p className="text-xs text-slate-600 mb-1">What does this bias mean?</p>
                  <p className="text-sm text-slate-800">{(bias as any).definition || bias.ai_explanation || bias.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-slate-500">Column(s): <span className="text-slate-700">{bias.column || '—'}</span></p>

        </div>

        {/* Severity + toggle placed together (icon-only toggle, no label) */}
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs ${getSeverityColor(bias.severity)}`}>{bias.severity}</span>
          <button
            aria-label={open ? 'Hide explanation' : 'Show explanation'}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(o => !o);
            }}
            className="p-1 rounded hover:bg-slate-100"
          >
            {open ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>
      {/* <p className="text-sm text-slate-700 leading-relaxed">{bias.description}</p> */}
      {open && (
        <div className="mt-2 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-5 text-sm">
          {hasStructured ? (
            <>
                  {renderSection('Meaning', filteredSections['Meaning'])}
                  {renderSection('Harm', filteredSections['Harm'])}
                  {renderSection('Impact', filteredSections['Impact'])}
                  {renderSection('Severity Explanation', filteredSections['Severity Explanation'])}
                  {renderSection('Fix', filteredSections['Fix'])}
            </>
          ) : (
            <div className="text-slate-600 text-sm" style={{ textAlign: 'justify' }} dangerouslySetInnerHTML={{ __html: formatExplanationBlock(bias.ai_explanation || 'No AI explanation available.') }} />
          )}
        </div>
      )}
    </Card>
  );
}

// Export a lightweight renderer for AI explanations so other cards can reuse formatting.
export function AiExplanation({ ai_explanation, column, bias_type, severity }: { ai_explanation?: string; column?: string; bias_type?: string; severity?: string }) {
  const sections = extractSections(ai_explanation || '');
  const filteredSections = { ...sections } as Record<string, string[]>;
  try {
    const sev = (severity || '').toString().trim().toLowerCase();
    const sevText = (filteredSections['Severity Explanation'] || []).join(' ').trim().toLowerCase();
    if (!sevText || sevText === sev || /^(low|moderate|high|critical)$/.test(sevText)) {
      filteredSections['Severity Explanation'] = [];
    }
  } catch (e) {
    /* ignore */
  }
  const hasStructured = Object.values(filteredSections).some(arr => arr.length);
  return (
    <div className="space-y-4 text-sm">
      {hasStructured ? (
        <>
          {renderSection('Meaning', filteredSections['Meaning'])}
          {renderSection('Harm', filteredSections['Harm'])}
          {renderSection('Impact', filteredSections['Impact'])}
          {renderSection('Severity Explanation', filteredSections['Severity Explanation'])}
          {renderSection('Fix', filteredSections['Fix'])}
        </>
      ) : (
        <div className="text-slate-600 text-sm" style={{ textAlign: 'justify' }} dangerouslySetInnerHTML={{ __html: formatExplanationBlock(ai_explanation || 'No AI explanation available.') }} />
      )}
    </div>
  );
}
