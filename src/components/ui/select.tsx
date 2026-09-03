import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
	return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
	return <SelectPrimitive.Group data-slot="select-group" className={cn('scroll-my-1', className)} {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/**
 * Mirrors the shared Input so both controls sit flush in the same form grid:
 * 42px tall, 6px radius, and an emerald focus ring.
 */
function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
	return (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			className={cn(
				'group flex min-h-10.5 w-full cursor-pointer items-center justify-between gap-2 rounded-[6px] border border-[#cfcfcf] bg-white px-3 py-2 text-left dark:border-white/12 dark:bg-[#0b0d0f]',
				'text-[14px] text-(--ink) shadow-[inset_0_1px_2px_rgb(0_0_0/0.025)] transition-colors outline-none data-placeholder:text-(--faint) [&_svg]:shrink-0',
				'hover:border-[#aaa] dark:hover:border-white/22',
				'focus-visible:border-(--primary-deep) focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] focus-visible:outline-none!',
				'data-[state=open]:border-(--primary-deep) data-[state=open]:shadow-[0_0_0_3px_rgb(36_180_126/0.14)]',
				'disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<ChevronDownIcon className="pointer-events-none size-4 text-(--faint) transition-transform group-data-[state=open]:rotate-180" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

/** Level 2 elevation + hairline border, per DESIGN.md "Elevation & Depth". */
function SelectContent({ className, children, position = 'popper', ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				data-slot="select-content"
				className={cn(
					'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto',
					'rounded-[8px] border border-(--hairline) bg-white text-(--ink) shadow-[0_8px_24px_rgb(0_0_0/0.08)] dark:bg-[#111419] dark:shadow-[0_12px_32px_rgb(0_0_0/0.55)]',
					'duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
					position === 'popper' &&
						'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
					className,
				)}
				position={position}
				{...props}
			>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'w-full min-w-(--radix-select-trigger-width)')}>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
	return (
		<SelectPrimitive.Label
			data-slot="select-label"
			className={cn('px-2 py-1.5 text-[12px] font-medium tracking-wide text-(--muted) uppercase', className)}
			{...props}
		/>
	);
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				'relative flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-[14px] text-(--ink) outline-hidden select-none',
				'focus:bg-[#ededed] dark:focus:bg-white/8 data-[state=checked]:font-medium',
				'data-disabled:pointer-events-none data-disabled:opacity-50',
				"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
			<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center text-(--primary-deep)">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon />
				</SelectPrimitive.ItemIndicator>
			</span>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
	return (
		<SelectPrimitive.Separator
			data-slot="select-separator"
			className={cn('pointer-events-none -mx-1 my-1 h-px bg-(--hairline)', className)}
			{...props}
		/>
	);
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
	return (
		<SelectPrimitive.ScrollUpButton
			data-slot="select-scroll-up-button"
			className={cn('flex cursor-default items-center justify-center py-1 text-(--faint)', className)}
			{...props}
		>
			<ChevronUpIcon className="size-4" />
		</SelectPrimitive.ScrollUpButton>
	);
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
	return (
		<SelectPrimitive.ScrollDownButton
			data-slot="select-scroll-down-button"
			className={cn('flex cursor-default items-center justify-center py-1 text-(--faint)', className)}
			{...props}
		>
			<ChevronDownIcon className="size-4" />
		</SelectPrimitive.ScrollDownButton>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};
