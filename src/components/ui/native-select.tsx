import type * as React from 'react';
import { cn } from '@/lib/utilities/cn';

export type NativeSelectProps = React.ComponentProps<'select'>;

export function NativeSelect({ className, ...props }: NativeSelectProps): React.JSX.Element {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input bg-background text-foreground focus-visible:ring-ring/60 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
