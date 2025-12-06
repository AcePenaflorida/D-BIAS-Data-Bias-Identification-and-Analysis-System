import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Copy as CopyIcon, Check as CheckIcon } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

  const getReferenceUrl = (biasType: string) => {
    const key = (biasType || '').toLowerCase();
    // Match common variants by substring to be resilient to generator wording
    if (key.includes('missing data') || key === 'missing data') {
      return 'https://www.scribbr.com/statistics/missing-data/';
    }
    if (key.includes('systematic missing') || key.includes('missingness')) {
      return 'https://gradientscience.org/missingness/';
    }
    if (key.includes('categorical imbalance') || key.includes('class imbalance') || key.includes('imbalanced')) {
      return 'https://developers.google.com/machine-learning/crash-course/overfitting/imbalanced-datasets';
    }
    if (key.includes('numeric correlation bias') || (key.includes('correlation') && key.includes('bias'))) {
      return 'https://developers.google.com/machine-learning/crash-course/overfitting/imbalanced-datasets';
    }
    if (key.includes('intersectional')) {
      return 'https://prism.sustainability-directory.com/term/intersectional-bias-in-ai/';
    }
    if (key === 'correlation bias' || (key.includes('correlation') && !key.includes('numeric'))) {
      return 'https://medium.com/@abdallahashraf90x/all-you-need-to-know-about-correlation-for-machine-learning-e249fec292e9';
    }
    if (key.includes('outlier')) {
      return 'https://www.geeksforgeeks.org/machine-learning/what-are-outliers-in-data/';
    }
    return undefined;
  };

  const copyPayload = () => {
    const payload = {
      id: bias.id,
      type: bias.bias_type,
      column: bias.column,
      severity: bias.severity,
      description: bias.description,
      ai_explanation: bias.ai_explanation,
      definition: bias.definition,
    };
    return JSON.stringify(payload, null, 2);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyPayload());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = copyPayload();
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); } finally { document.body.removeChild(ta); }
    }
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
    <Card
      className="p-5 bias-card-hover cursor-pointer"
      onClick={() => setIsExpanded(e => !e)}
      role="region"
      aria-expanded={isExpanded}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-2 flex-1">
          <h4 className="card-title text-slate-900 font-semibold tracking-tight transition-all duration-800">{bias.bias_type}</h4>
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
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs ring-1 ${getSeverityColor(bias.severity)} transition-all duration-300`}>
            {bias.severity}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy bias details'}
            className="copy-button inline-flex items-center justify-center p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:scale-[1.15] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white transition-all duration-200 ease-out active:scale-[0.95]"
            title={copied ? 'Copied!' : 'Copy details'}
          >
            {copied ? <CheckIcon className="w-4 h-4 text-green-600 animate-pulse" /> : <CopyIcon className="w-4 h-4" />}
          </button>
        </div>
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
        <button
          aria-label={isExpanded ? 'Hide explanation' : 'Show explanation'}
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded hover:bg-slate-100 transition-all duration-300 hover:scale-110"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-600 transition-transform duration-300" /> : <ChevronDown className="w-4 h-4 text-slate-600 transition-transform duration-300" />}
        </button>
      </div>

      {isExpanded && (
        <div className="card-expand-content mt-3 p-4 bg-slate-50/80 rounded-xl ring-1 ring-slate-200 space-y-3">
              <AiExplanation ai_explanation={bias.ai_explanation} column={bias.column} bias_type={bias.bias_type} severity={bias.severity} />
        </div>
      )}

      {/* Card footer: Learn more link */}
      {getReferenceUrl(bias.bias_type) && (
        <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
          <a
            href={getReferenceUrl(bias.bias_type)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white transition-transform transition-colors duration-150 ease-out hover:underline hover:scale-[1.01] px-1 rounded"
          >
            Learn more
          </a>
        </div>
      )}
    </Card>
  );
}
