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
          <p className="text-slate-700 text-sm leading-relaxed">{bias.ai_explanation}</p>
        </div>
      )}
    </Card>
  );
}
