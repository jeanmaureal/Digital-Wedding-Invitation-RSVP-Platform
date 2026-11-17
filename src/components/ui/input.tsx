import type * as React from 'react';
import { cn } from '@/lib/utilities/cn';

export type InputProps = React.ComponentProps<'input'>;

export function Input({ className, type = 'text', ...props }: InputProps): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring/60 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-xs transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
