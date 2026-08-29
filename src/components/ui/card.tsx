import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

// Customized from radix-nova: layout and typography defaults are intentionally left to consumer styles.
function Card({ className, asChild = false, ...props }: React.ComponentProps<'div'> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : 'div';

	return <Comp data-slot="card" className={cn('flex flex-col rounded-[8px] border border-[#e3e3e3] bg-white', className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-header" className={cn(className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-title" className={cn(className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-description" className={cn(className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-action" className={cn(className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-content" className={cn(className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-footer" className={cn(className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
