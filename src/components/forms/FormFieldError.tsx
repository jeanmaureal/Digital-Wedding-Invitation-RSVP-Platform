import type * as React from 'react';
import { cn } from '@/lib/utilities/cn';

export interface FormFieldErrorProps {
  readonly id?: string | undefined;
  readonly message?: string | undefined;
  readonly className?: string | undefined;
}

export function FormFieldError({
  id,
  message,
  className,
}: FormFieldErrorProps): React.JSX.Element | null {
  if (!message) {
    return null;
  }

  return (
    <p id={id} role="alert" className={cn('text-destructive text-xs font-medium', className)}>
      {message}
    </p>
  );
}
