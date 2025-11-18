import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Card } from './ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface BiasCardProps {
  bias: {
    id: string;
    bias_type: string;
    column: string;
    severity: 'Low' | 'Moderate' | 'High' | 'Critical';
    description: string;
    ai_explanation: string;
    definition: string;
  };
}

export function BiasCard({ bias }: BiasCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  type SectionKey = 'Meaning' | 'Harm' | 'Impact' | 'Severity Explanation' | 'Fix';

  const extractStructuredSections = (text: string): Partial<Record<SectionKey, string>> => {
    const src = String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\u00A0]/g, ' ')
      .replace(/\n{3,}/g, '\n\n');

    const labelMap: Array<{ key: SectionKey; re: RegExp }> = [
      { key: 'Meaning', re: /(^|\n)\s*(Meaning|What\s+it\s+means)\s*:\s*/i },
      { key: 'Harm', re: /(^|\n)\s*(Harm|Risks|Downsides)\s*:\s*/i },
      { key: 'Impact', re: /(^|\n)\s*(Impact|Effect|Implications)\s*:\s*/i },
      { key: 'Severity Explanation', re: /(^|\n)\s*(Severity\s*(Explanation|Rationale)?|Why\s+this\s+severity)\s*:\s*/i },
      { key: 'Fix', re: /(^|\n)\s*(Fix|Mitigation|Remediation|Recommendations?)\s*:\s*/i },
    ];

    // Find all labeled section positions
    const matches: Array<{ key: SectionKey; index: number; len: number }> = [];
    for (const { key, re } of labelMap) {
      const m = re.exec(src);
      if (m) matches.push({ key, index: m.index + (m[1]?.length || 0), len: m[0].length - (m[1]?.length || 0) });
    }
    matches.sort((a, b) => a.index - b.index);
    const out: Partial<Record<SectionKey, string>> = {};
    if (!matches.length) return out;
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const start = cur.index + cur.len;
      const end = i + 1 < matches.length ? matches[i + 1].index : src.length;
      const chunk = src.slice(start, end).trim();
      if (chunk) out[cur.key] = chunk;
    }
    return out;
  };

  const renderSection = (title: string, body?: string) => {
    if (!body) return null;
    const lines = body.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const asList = lines.every(l => /^[-*•]|^\d+\./.test(l));
    if (asList) {
      return (
        <div className="space-y-1">
          <div className="text-slate-800 text-sm font-semibold">{title}</div>
          <ul className="list-disc pl-5 text-slate-700 text-sm space-y-1">
            {lines.map((l, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: formatBold(l.replace(/^[-*•]\s*/, '')) }} />
            ))}
          </ul>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="text-slate-800 text-sm font-semibold">{title}</div>
        {lines.map((l, i) => (
          <p key={i} className="text-slate-700 text-sm" dangerouslySetInnerHTML={{ __html: formatBold(l) }} />
        ))}
      </div>
    );
  };

  const renderMetaBullets = (items: Array<{ label: string; value?: string }>) => {
    const visible = items.filter(i => (i.value ?? '').toString().trim().length > 0);
    if (!visible.length) return null;
    return (
      <div className="space-y-1">
        <div className="text-slate-800 text-sm font-semibold">Details</div>
        <ul className="list-disc pl-5 text-slate-700 text-sm space-y-1">
          {visible.map((i, idx) => (
            <li key={idx}>
              <span className="font-semibold">{i.label}: </span>
              <span dangerouslySetInnerHTML={{ __html: formatBold(String(i.value)) }} />
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const getSeverityColor = (severity: string) => {
    // Return a set of utility classes that style the severity badge.
    // Use subtle background, stronger text color and a light ring to make it readable on light/dark backgrounds.
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-2 flex-1">
          <h4 className="text-slate-900 font-semibold tracking-tight">{bias.bias_type}</h4>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button aria-label="Bias definition" className="text-slate-400 hover:text-slate-600 transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                  <TooltipContent side="top" align="start" sideOffset={12} className="max-w-xs">
                  <p className="text-xs text-slate-600 mb-1">What does this bias mean?</p>
                  <p className="text-sm text-slate-800">{bias.definition}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs ring-1 ${getSeverityColor(bias.severity)}`}>
          {bias.severity}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">Column</span>
          <span className="px-2.5 py-0.5 rounded-full ring-1 ring-slate-200 bg-white text-slate-700 text-xs font-mono">{bias.column}</span>
        </div>
        <p className="text-slate-700 text-sm leading-relaxed">{bias.description}</p>
      </div>

      {/* Severity + icon-only toggle placed together */}
      <div className="flex items-center justify-end gap-2">
        <span className={`px-3 py-1 rounded-full text-xs ring-1 ${getSeverityColor(bias.severity)}`}>{bias.severity}</span>
        <button
          aria-label={isExpanded ? 'Hide explanation' : 'Show explanation'}
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded hover:bg-slate-100"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 p-4 bg-slate-50/80 rounded-xl ring-1 ring-slate-200 space-y-3">
          {(() => {
            const sections = extractStructuredSections(bias.ai_explanation || '');
            return (
              <div className="space-y-4">
                {/* Meta bullets */}
                {renderMetaBullets([
                  { label: 'Feature(s)', value: bias.column },
                  { label: 'Bias Type', value: bias.bias_type },
                  { label: 'Severity', value: bias.severity },
                ])}
                {/* Content sections from AI */}
                {renderSection('Meaning', sections['Meaning'])}
                {renderSection('Harm', sections['Harm'])}
                {renderSection('Impact', sections['Impact'])}
                {renderSection('Severity Explanation', sections['Severity Explanation'])}
                {renderSection('Fix', sections['Fix'])}
                {!sections['Meaning'] && !sections['Harm'] && !sections['Impact'] && !sections['Severity Explanation'] && !sections['Fix'] && (
                  <p className="text-slate-500 text-sm">No structured details available.</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
