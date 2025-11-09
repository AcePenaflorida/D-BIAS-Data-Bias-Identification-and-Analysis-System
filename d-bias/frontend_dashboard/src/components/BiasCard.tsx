import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
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

  const parseAiExplanation = (text: string) => {
    if (!text) return { headers: [] as string[], paragraphs: [] as string[], bullets: [] as Array<{ text: string; order?: number; level: number }> };
    const normalized = text
      .replace(/\r\n?/g, "\n")
      .replace(/[\t\u00A0]/g, ' ')
      .replace(/\n{2,}/g, "\n\n")
      // Convert inline star separators like "... values. * Fix:" into a true bullet line
      .replace(/\s\*\s+(?=\S)/g, "\n* ");
    const rawLines = normalized.split(/\n/);

    const bullets: Array<{ text: string; order?: number; level: number }> = [];
    const paragraphs: string[] = [];
    const headers: string[] = [];
  const mdHeaderRe = /^\s*#{2,6}\s+(.*)$/;
    const orderedRe = /^(\s*)(\d+)[\.)]\s+(.*)$/;
    const unorderedRe = /^(\s*)(?:\*+|[-•])\s+(.*)$/;
    const labelBulletRe = /^(\s*)(?:<strong>[^<]+<\/strong>|[A-Za-z][^:]{2,50}):\s*(.*)$/;

    let lastWasHeaderOrColon = false;
    for (let raw of rawLines) {
      const trimmed = raw.trim();
      if (!trimmed) { lastWasHeaderOrColon = false; continue; }
      // Drop horizontal rules or stray dashes
      if (/^[-–—]{3,}$/.test(trimmed)) { lastWasHeaderOrColon = false; continue; }
      // Skip noisy lines like "Detection: ..." or "Detected: ..."
      if (/^(?:Detection|Detected)\s*:/i.test(trimmed)) { lastWasHeaderOrColon = false; continue; }
      const hdr = raw.match(mdHeaderRe);
      if (hdr) {
        const title = hdr[1].trim()
          // Remove leading numbering like "1." or "2)"
          .replace(/^\d+[\.)]?\s*/, '')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*\*/g, '');
        headers.push(title);
        lastWasHeaderOrColon = true;
        continue;
      }
      const om = raw.match(orderedRe);
      if (om) {
        const indent = om[1] || '';
        const level = Math.min(3, Math.floor(indent.length / 2));
        const num = parseInt(om[2], 10);
        let content = om[3].trim()
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*\*/g, '');
        bullets.push({ text: `${num}. ${content}`, order: num, level });
        lastWasHeaderOrColon = /:\s*$/.test(content);
        continue;
      }
      const um = raw.match(unorderedRe);
      if (um) {
        const indent = um[1] || '';
        const level = Math.min(3, Math.floor(indent.length / 2));
        let content = um[2].trim()
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*\*/g, '');
        bullets.push({ text: content, level });
        lastWasHeaderOrColon = /:\s*$/.test(content);
        continue;
      }
      let transformed = trimmed
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*\*/g, '');
      const lbm = transformed.match(labelBulletRe);
      if (lbm) {
        const indent = lbm[1] || '';
        const lvl = Math.min(3, Math.floor(indent.length / 2)) + (lastWasHeaderOrColon ? 1 : 0);
        bullets.push({ text: transformed, level: Math.max(lvl, 1) });
        lastWasHeaderOrColon = /:\s*$/.test(transformed);
        continue;
      }
      paragraphs.push(transformed);
      lastWasHeaderOrColon = /:\s*$/.test(transformed);
    }
    return { headers, paragraphs, bullets };
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Low':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'Moderate':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'High':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Critical':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-2 flex-1">
          <h4 className="text-slate-900">{bias.bias_type}</h4>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-slate-400 hover:text-slate-600 transition-colors">
                  <Info className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-sm">{bias.definition}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs border ${getSeverityColor(bias.severity)}`}>
          {bias.severity}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <div>
          <span className="text-slate-500 text-sm">Column: </span>
          <span className="text-slate-900 text-sm">{bias.column}</span>
        </div>
        <p className="text-slate-700 text-sm">{bias.description}</p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between"
      >
        <span className="text-sm">AI Explanation</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </Button>

      {isExpanded && (
        <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          {(() => {
            const { headers, paragraphs, bullets } = parseAiExplanation(bias.ai_explanation || '');
            return (
              <div className="space-y-3">
                {headers.length > 0 && (
                  <div className="space-y-1">
                    {headers.map((h, idx) => (
                      <div key={idx} className="text-slate-800 text-sm font-semibold" dangerouslySetInnerHTML={{ __html: h }} />
                    ))}
                  </div>
                )}
                {paragraphs.length > 0 && (
                  <div className="space-y-2">
                    {paragraphs.map((p, idx) => (
                      <p key={idx} className="text-slate-700 text-sm leading-relaxed">{p}</p>
                    ))}
                  </div>
                )}
                {bullets.length > 0 && (
                  <ul className="text-slate-700 text-sm space-y-1">
                    {bullets.map((b: { text: string; order?: number; level: number }, idx: number) => {
                      const ml = (b.level || 0) * 16;
                      const isOrdered = typeof b.order === 'number';
                      return (
                        <li
                          key={idx}
                          className={isOrdered ? 'list-none font-medium' : 'list-disc'}
                          style={{ marginLeft: ml }}
                          dangerouslySetInnerHTML={{ __html: b.text }}
                        />
                      );
                    })}
                  </ul>
                )}
                {paragraphs.length === 0 && bullets.length === 0 && (
                  <p className="text-slate-500 text-sm">No AI explanation available.</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
