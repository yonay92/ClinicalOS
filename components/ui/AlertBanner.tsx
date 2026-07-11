'use client';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
}

const VARIANT_CONFIG: Record<AlertVariant, { container: string; text: string }> = {
  info: { container: 'border-blue-200 bg-blue-50', text: 'text-blue-800' },
  success: { container: 'border-green-200 bg-green-50', text: 'text-green-800' },
  warning: { container: 'border-yellow-200 bg-yellow-50', text: 'text-yellow-800' },
  error: { container: 'border-red-200 bg-red-50', text: 'text-red-800' },
};

export function AlertBanner({ variant = 'info', title, message, onDismiss }: AlertBannerProps) {
  const { container, text } = VARIANT_CONFIG[variant];

  return (
    <div className={`rounded-lg border p-4 ${container}`} role="alert">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          {title && <p className={`text-sm font-semibold ${text}`}>{title}</p>}
          <p className={`text-sm ${text}`}>{message}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`shrink-0 opacity-60 hover:opacity-100 ${text}`}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
