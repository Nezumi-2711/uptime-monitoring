import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn('table-scrollbar flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-1', className)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-1.75 text-caption font-medium whitespace-nowrap outline-none transition-colors select-none',
				'text-icon-muted hover:bg-[rgb(62_207_142/0.1)] hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-deep/40 disabled:pointer-events-none disabled:opacity-50',
				'data-[state=active]:bg-[rgb(62_207_142/0.1)] data-[state=active]:text-primary-deep',
				'dark:text-[#9ca3af] dark:hover:bg-[rgba(62,207,142,0.12)] dark:hover:text-brand',
				'dark:data-[state=active]:bg-[rgba(62,207,142,0.12)] dark:data-[state=active]:text-brand',
				"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content data-slot="tabs-content" className={cn('mt-5 outline-none focus-visible:outline-none', className)} {...props} />
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
