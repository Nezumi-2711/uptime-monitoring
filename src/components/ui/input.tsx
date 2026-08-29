import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Matches the monitor and authentication form controls so it sits flush next
 * to a SelectTrigger: 42px tall, 6px radius, and an emerald focus ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				'flex min-h-10.5 w-full rounded-[6px] border border-[#cfcfcf] bg-white px-3 py-2',
				'text-[14px] text-(--ink) shadow-[inset_0_1px_2px_rgb(0_0_0/0.025)] transition-colors outline-none',
				'placeholder:text-(--faint)',
				'hover:border-[#aaa]',
				'focus-visible:border-(--primary-deep) focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] focus-visible:outline-none!',
				'disabled:cursor-not-allowed disabled:opacity-50',
				'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_rgb(220_98_98/0.14)]',
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
