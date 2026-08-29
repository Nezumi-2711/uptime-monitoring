import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const emptyVariants = cva('grid justify-items-center bg-transparent p-[56px_24px] text-center', {
	variants: {
		variant: {
			default: '',
			error: 'rounded-[8px] border border-[#ebd1d1] bg-[#fffafa]',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

const emptyMediaVariants = cva('', {
	variants: {
		variant: {
			default: '',
			icon: 'mb-4.5 grid size-12 place-items-center rounded-[8px] border border-[#dcdcdc] bg-[#fafafa] text-[#666] [&_svg]:size-5.5',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

type EmptyVariant = NonNullable<VariantProps<typeof emptyVariants>['variant']>;

const EmptyVariantContext = React.createContext<EmptyVariant>('default');

function Empty({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & VariantProps<typeof emptyVariants>) {
	const resolvedVariant = variant ?? 'default';

	return (
		<EmptyVariantContext.Provider value={resolvedVariant}>
			<div
				data-slot="empty"
				data-variant={resolvedVariant}
				className={cn(emptyVariants({ variant: resolvedVariant }), className)}
				{...props}
			/>
		</EmptyVariantContext.Provider>
	);
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="empty-header" className={cn('grid justify-items-center', className)} {...props} />;
}

function EmptyMedia({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) {
	const emptyVariant = React.useContext(EmptyVariantContext);

	return (
		<div
			data-slot="empty-media"
			data-variant={variant}
			className={cn(
				emptyMediaVariants({ variant }),
				emptyVariant === 'error' && variant === 'icon' && 'border-[#ebcaca] bg-[#fff3f3] text-[#a34242]',
				className,
			)}
			{...props}
		/>
	);
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {
	const variant = React.useContext(EmptyVariantContext);

	return (
		<div
			data-slot="empty-title"
			className={cn('text-[16px] font-medium text-[#171717]', variant === 'error' && 'text-[#8b3434]', className)}
			{...props}
		/>
	);
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
	return (
		<p data-slot="empty-description" className={cn('mt-2 max-w-105 text-[13px] leading-[1.55] text-(--muted)', className)} {...props} />
	);
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="empty-content" className={cn('mt-5 flex flex-col items-center', className)} {...props} />;
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
