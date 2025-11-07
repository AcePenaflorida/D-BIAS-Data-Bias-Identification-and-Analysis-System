import { Card } from './ui/card';
import { Progress } from './ui/progress';
import FairnessDonut from './charts/FairnessDonut';

interface StatCardProps {
  title: string;
  value: string | number;
  variant?: 'default' | 'success' | 'error';
  showProgress?: boolean;
  showDonut?: boolean;
  max?: number;
  className?: string;
}

export function StatCard({
  title,
  value,
  variant = 'default',
  showProgress = false,
  showDonut = false,
  max = 100,
  className,
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

  return (
    <Card className={`p-5 ${getVariantClasses()} ${className || ''}`}>
      <p className="text-slate-600 text-sm mb-2">{title}</p>

      {showDonut && typeof value === 'number' ? (
        <div className="flex-1 flex items-center justify-center">
          <FairnessDonut score={Number(value)} size={88} strokeWidth={10} showCenterText />
        </div>
      ) : (
        <>
          <p className={`text-2xl ${getValueColor()}`}>{value}</p>
          {showProgress && typeof value === 'number' && (
            <div className="mt-3">
              <Progress value={value} max={max} className="h-2" />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
