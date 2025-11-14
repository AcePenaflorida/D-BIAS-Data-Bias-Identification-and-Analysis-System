import { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
    const hdr = raw.match(/^(Meaning|Harm|Impact|Severity\s*(?:Explanation|Rationale)?|Fix|Mitigation|Recommendations?)\s*:/i);
    if (hdr) {
      const label = hdr[1].toLowerCase();
      current = (label.startsWith('severity') ? 'Severity Explanation' : label.startsWith('mitigation') || label.startsWith('recommend') ? 'Fix' : (hdr[1] as keyof typeof sections)) as keyof typeof sections;
      const rest = raw.replace(/^[^:]+:\s*/, '').trim();
      if (rest) sections[current].push(rest);
      continue;
    }
    if (current) sections[current].push(raw);
  }
  return sections;
}

const formatBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function renderSection(title: string, bodyLines?: string[] | string) {
  if (!bodyLines || (Array.isArray(bodyLines) && bodyLines.length === 0)) return null;
  const lines = Array.isArray(bodyLines) ? bodyLines : String(bodyLines).split(/\n+/);
  const cleaned = lines.map(l => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const asList = cleaned.every(l => /^[-*•]|^\d+\./.test(l) || cleaned.length > 1);
  return (
    <div className="space-y-1">
      <h5 className="text-slate-800 font-medium">{title}</h5>
      {asList ? (
        <ul className="list-disc pl-5 space-y-1 text-slate-700">
          {cleaned.map((l, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: formatBold(l.replace(/^[-*•]\s*/, '')) }} />
          ))}
        </ul>
      ) : (
        cleaned.map((l, i) => (
          <p key={i} className="text-slate-700" dangerouslySetInnerHTML={{ __html: formatBold(l) }} />
        ))
      )}
    </div>
  );
}

function renderMetaBullets(label: string, items: Array<{ label: string; value?: string }>) {
  const visible = items.filter(i => (i.value ?? '').toString().trim().length > 0);
  if (!visible.length) return null;
  return (
    <div className="space-y-1">
      <h5 className="text-slate-800 font-medium">{label}</h5>
      <ul className="list-disc pl-5 space-y-1 text-slate-700">
        {visible.map((i, idx) => (
          <li key={idx}>
            <span className="font-semibold">{i.label}: </span>
            <span dangerouslySetInnerHTML={{ __html: formatBold(String(i.value)) }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExtendedBiasCard({ bias }: ExtendedBiasCardProps) {
  const [open, setOpen] = useState(false);
  const sections = extractSections(bias.ai_explanation || '');
  const hasStructured = Object.values(sections).some(arr => arr.length);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-slate-900 mb-1 truncate" title={bias.bias_type}>{bias.bias_type}</h4>
          <p className="text-xs text-slate-500">Column(s): <span className="text-slate-700">{bias.column || '—'}</span></p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs border bg-slate-50 text-slate-700 border-slate-200">{bias.severity}</span>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{bias.description}</p>
      <Button variant="ghost" size="sm" className="w-full justify-between" onClick={() => setOpen(o => !o)}>
        <span className="text-sm">{open ? 'Hide Explanation' : 'Show Explanation'}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>
      {open && (
        <div className="mt-2 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-5 text-sm">
          {hasStructured ? (
            <>
              {renderMetaBullets('Details', [
                { label: 'Feature(s)', value: bias.column },
                { label: 'Bias Type', value: bias.bias_type },
                { label: 'Severity', value: bias.severity },
              ])}
              {renderSection('Meaning', sections['Meaning'])}
              {renderSection('Harm', sections['Harm'])}
              {renderSection('Impact', sections['Impact'])}
              {renderSection('Severity Explanation', sections['Severity Explanation'])}
              {renderSection('Fix', sections['Fix'])}
            </>
          ) : (
            <p className="text-slate-600" dangerouslySetInnerHTML={{ __html: formatBold(bias.ai_explanation || 'No AI explanation available.') }} />
          )}
        </div>
      )}
    </Card>
  );
}
