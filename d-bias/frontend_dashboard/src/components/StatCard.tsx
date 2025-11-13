import { Card } from './ui/card';
import { Progress } from './ui/progress';
import FairnessDonut from './charts/FairnessDonut';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: ReactNode;
  variant?: 'default' | 'success' | 'error';
  showProgress?: boolean;
  showDonut?: boolean;
  max?: number;
  className?: string;
  compact?: boolean;
}

export function StatCard({
  title,
  value,
  variant = 'default',
  showProgress = false,
  showDonut = false,
  max = 100,
  className,
  compact = false,
}: StatCardProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-slate-200 bg-white';
    }
  };

  const getValueColor = () => {
    switch (variant) {
      case 'success':
        return 'text-green-700';
      case 'error':
        return 'text-red-700';
      default:
        return 'text-slate-900';
    }
  };

  const pad = compact ? 'p-4' : 'p-5';
  const titleCls = compact ? 'text-slate-600 text-xs mb-1' : 'text-slate-600 text-sm mb-2';
  const valueCls = compact ? `text-xl ${getValueColor()}` : `text-2xl ${getValueColor()}`;

  return (
    <Card className={`${pad} ${getVariantClasses()} ${className || ''}`}>
      <p className={titleCls}>{title}</p>

      {showDonut && typeof value === 'number' ? (
        <div className="flex-1 flex items-center justify-center">
          <FairnessDonut score={Number(value)} size={compact ? 68 : 88} strokeWidth={10} showCenterText />
        </div>
      ) : (
        <>
          <div className={valueCls}>{value}</div>
          {showProgress && typeof value === 'number' && (
            <div className={`mt-3 ${compact ? 'mt-2' : ''}`}>
              <Progress value={value} max={max} className="h-2" />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
