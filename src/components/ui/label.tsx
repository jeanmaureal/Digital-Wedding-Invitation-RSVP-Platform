import type * as React from 'react';
import { cn } from '@/lib/utilities/cn';

export type LabelProps = React.ComponentProps<'label'>;

export function Label({ className, ...props }: LabelProps): React.JSX.Element {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
