import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.75 text-[12px] font-medium [&>i]:size-1.75 [&>i]:shrink-0 [&>i]:rounded-full', {
	variants: {
		variant: {
			online: 'text-[#16885b] dark:text-[#4ade80] [&>i]:bg-(--primary-deep) [&>i]:shadow-[0_0_0_3px_rgb(62_207_142/0.12)]',
			offline: 'text-[#ae3d3d] dark:text-[#f87171] [&>i]:bg-[#d05a5a]',
			pending: 'text-[#8a5a1f] dark:text-[#f6c86a] [&>i]:bg-[#e0913f] [&>i]:shadow-[0_0_0_3px_rgb(224_145_63/0.14)]',
			checking: 'text-[#8b7722] dark:text-[#fde047] [&>i]:animate-[blink_1.1s_ease-in-out_infinite] [&>i]:bg-[#d7bd53]',
			maintenance: 'text-[#3f6fb8] dark:text-[#8bb5ee] [&>i]:bg-[#5a8fd0]',
		},
	},
	defaultVariants: {
		variant: 'online',
	},
});

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

function Badge({ className, variant = 'online', children, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
	return (
		<span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props}>
			<i aria-hidden="true" />
			{children}
		</span>
	);
}

export { Badge, badgeVariants, type BadgeVariant };
