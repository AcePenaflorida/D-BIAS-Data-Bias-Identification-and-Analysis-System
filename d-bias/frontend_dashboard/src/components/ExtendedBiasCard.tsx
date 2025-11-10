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
    Fix: [],
  };
  if (!text) return sections;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let current: keyof typeof sections | null = null;
  for (const raw of lines) {
    const hdr = raw.match(/^(Meaning|Harm|Impact|Fix)\s*:/i);
    if (hdr) {
      current = hdr[1] as keyof typeof sections;
      const rest = raw.replace(/^[^:]+:\s*/,'').trim();
      if (rest) sections[current].push(rest);
      continue;
    }
    if (current) sections[current].push(raw);
  }
  return sections;
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
        <div className="mt-2 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-4 text-sm">
          {hasStructured ? (
            Object.entries(sections).map(([key, arr]) => (
              arr.length ? (
                <div key={key}>
                  <h5 className="text-slate-800 font-medium mb-1">{key}</h5>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    {arr.map((line, idx) => <li key={idx}>{line}</li>)}
                  </ul>
                </div>
              ) : null
            ))
          ) : (
            <p className="text-slate-600">{bias.ai_explanation || 'No AI explanation available.'}</p>
          )}
        </div>
      )}
    </Card>
  );
}
