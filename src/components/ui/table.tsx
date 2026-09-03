import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
	return <table data-slot="table" className={cn('w-full border-collapse text-[12px]', className)} {...props} />;
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
	return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
	return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
	return <tfoot data-slot="table-footer" className={cn(className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
	return <tr data-slot="table-row" className={cn(className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'sticky top-0 z-1 bg-[#fafafa] px-4 py-2.75 text-left font-normal text-[#707070] shadow-[0_1px_#e5e5e5] dark:bg-[#14171d] dark:text-[#aeb4bf] dark:shadow-[0_1px_rgb(255_255_255/0.08)]',
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				'whitespace-nowrap border-t border-[#ededed] px-4 py-3.5 text-[#555] dark:border-white/8 dark:text-[#d1d5db]',
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
	return <caption data-slot="table-caption" className={cn('mt-4 text-[12px] text-[#707070] dark:text-[#aeb4bf]', className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
