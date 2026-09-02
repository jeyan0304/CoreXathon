import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;
}

export const Loader: React.FC<LoaderProps> = ({
  message = 'Loading...',
  size = 'md',
  inline = false,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }[size];

  if (inline) {
    return (
      <span className="inline-flex items-center gap-2 text-slate-600 text-sm">
        <Loader2 className={`${sizeClasses} animate-spin text-blue-600`} />
        {message && <span>{message}</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 gap-3">
      <Loader2 className={`${sizeClasses} animate-spin text-blue-600`} />
      {message && <p className="text-sm font-medium text-slate-600">{message}</p>}
    </div>
  );
};
