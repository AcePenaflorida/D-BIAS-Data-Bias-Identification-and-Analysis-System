import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Card } from './ui/card';
import { AiExplanation } from './ExtendedBiasCard';
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
              <AiExplanation ai_explanation={bias.ai_explanation} column={bias.column} bias_type={bias.bias_type} severity={bias.severity} />
        </div>
      )}
    </Card>
  );
}
