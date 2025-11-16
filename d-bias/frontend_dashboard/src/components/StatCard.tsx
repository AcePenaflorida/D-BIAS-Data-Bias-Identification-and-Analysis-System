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
  /** Optional subtitle / description rendered below the value */
  subtitle?: ReactNode;
  /** Optional addon rendered to the right of the title (e.g., a pill) */
  titleAddon?: ReactNode;
  /** Render a small inline badge next to either the title or the value */
  inlineBadge?: boolean;
  inlineBadgePosition?: 'title' | 'value';
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
  subtitle,
  titleAddon,
  inlineBadge = false,
  inlineBadgePosition = 'title',
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
  // Title class variant for inline layout (remove bottom margin so it vertically centers with addons)
  const titleInlineCls = titleCls.replace(/mb-\d+/, 'mb-0');
  const valueCls = compact ? `text-xl ${getValueColor()}` : `text-2xl ${getValueColor()}`;

  return (
    <Card className={`relative ${pad} ${getVariantClasses()} ${className || ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className={titleInlineCls}>{title}</p>
        {titleAddon && (
          // ensure addon text-size matches the title and nudge slightly for optical alignment
          <div className="flex-shrink-0 inline-flex items-center text-sm leading-none -mt-0.5">{titleAddon}</div>
        )}
      </div>

      {showDonut && typeof value === 'number' ? (
        <div className="flex-1 flex items-center justify-center">
          <FairnessDonut score={Number(value)} size={compact ? 68 : 88} strokeWidth={10} showCenterText />
        </div>
      ) : (
        <>
          {/* Value and optional inline badge positioned here when requested */}
          {inlineBadge && inlineBadgePosition === 'value' ? (
            <div className={`flex items-center gap-2 ${compact ? '' : ''}`}>
              <div className={valueCls}>{value}</div>
              <div className="w-6 h-6 -mt-1 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  {/* Base circle */}
                  <circle cx="16" cy="16" r="9.5" fill="#2EB86E" />
                  {/* Scallops */}
                  <circle cx="26" cy="16" r="4.5" fill="#2EB86E" />
                  <circle cx="25.66" cy="21" r="4.5" fill="#2EB86E" />
                  <circle cx="21" cy="24.66" r="4.5" fill="#2EB86E" />
                  <circle cx="16" cy="26" r="4.5" fill="#2EB86E" />
                  <circle cx="11" cy="24.66" r="4.5" fill="#2EB86E" />
                  <circle cx="8.66" cy="21" r="4.5" fill="#2EB86E" />
                  <circle cx="6" cy="16" r="4.5" fill="#2EB86E" />
                  <circle cx="8.66" cy="11" r="4.5" fill="#2EB86E" />
                  <circle cx="11" cy="7.34" r="4.5" fill="#2EB86E" />
                  <circle cx="16" cy="6" r="4.5" fill="#2EB86E" />
                  <circle cx="21" cy="7.34" r="4.5" fill="#2EB86E" />
                  <circle cx="25.66" cy="11" r="4.5" fill="#2EB86E" />
                  <path d="M10.5 16.5 L14.5 20.5 L22.5 12.5" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
            </div>
          ) : (
            <div className={valueCls}>{value}</div>
          )}

          {showProgress && typeof value === 'number' && (
            <div className={`mt-3 ${compact ? 'mt-2' : ''}`}>
              <Progress value={value} max={max} className="h-2" />
            </div>
          )}
        </>
      )}

      {/* Subtitle / description under the value (keeps card size intact) */}
      {subtitle && <p className="mt-4 text-slate-600 text-sm">{subtitle}</p>}
    </Card>
  );
}
