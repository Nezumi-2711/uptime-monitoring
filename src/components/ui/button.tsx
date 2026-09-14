import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-oklch(0.922 0 0) border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-oklch(0.708 0 0) focus-visible:ring-3 focus-visible:ring-oklch(0.708 0 0)/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-oklch(0.577 0.245 27.325) aria-invalid:ring-3 aria-invalid:ring-oklch(0.577 0.245 27.325)/20 dark:aria-invalid:border-oklch(0.577 0.245 27.325)/50 dark:aria-invalid:ring-oklch(0.577 0.245 27.325)/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:border-oklch(1 0 0 / 10%) dark:focus-visible:border-oklch(0.556 0 0) dark:focus-visible:ring-oklch(0.556 0 0)/50 dark:aria-invalid:border-oklch(0.704 0.191 22.216) dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/20 dark:dark:aria-invalid:border-oklch(0.704 0.191 22.216)/50 dark:dark:aria-invalid:ring-oklch(0.704 0.191 22.216)/40 cursor-pointer",
	{
		variants: {
			variant: {
				unstyled: null,
				default:
					'bg-oklch(0.205 0 0) text-oklch(0.985 0 0) hover:bg-oklch(0.205 0 0)/80 dark:bg-oklch(0.922 0 0) dark:text-oklch(0.205 0 0) dark:hover:bg-oklch(0.922 0 0)/80',
				brand:
					'rounded-sm border-brand-border bg-brand font-semibold text-ink shadow-btn-primary transition-all duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:bg-brand-hover active:not-disabled:translate-y-px active:not-disabled:bg-brand-deep disabled:cursor-wait disabled:opacity-[0.62] dark:border-brand dark:bg-brand dark:text-brand-dark-text dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_14px_rgba(62,207,142,0.3),inset_0_1px_0_rgba(255,255,255,0.35)] dark:hover:not-disabled:-translate-y-px dark:hover:not-disabled:border-brand-light dark:hover:not-disabled:bg-brand-light dark:hover:not-disabled:shadow-[0_4px_20px_rgba(62,207,142,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] dark:active:not-disabled:translate-y-px dark:active:not-disabled:bg-brand-deep',
				primary:
					'rounded-sm border-brand-border bg-brand font-semibold text-ink shadow-btn-primary transition-all duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:bg-brand-hover active:not-disabled:translate-y-px active:not-disabled:bg-brand-deep disabled:cursor-wait disabled:opacity-[0.62] dark:border-brand dark:bg-brand dark:text-brand-dark-text dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_14px_rgba(62,207,142,0.3),inset_0_1px_0_rgba(255,255,255,0.35)] dark:hover:not-disabled:-translate-y-px dark:hover:not-disabled:border-brand-light dark:hover:not-disabled:bg-brand-light dark:hover:not-disabled:shadow-[0_4px_20px_rgba(62,207,142,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] dark:active:not-disabled:translate-y-px dark:active:not-disabled:bg-brand-deep',
				outline:
					'border-oklch(0.922 0 0) bg-oklch(1 0 0) hover:bg-oklch(0.97 0 0) hover:text-oklch(0.145 0 0) aria-expanded:bg-oklch(0.97 0 0) aria-expanded:text-oklch(0.145 0 0) dark:border-oklch(0.922 0 0) dark:bg-oklch(0.922 0 0)/30 dark:hover:bg-oklch(0.922 0 0)/50 dark:border-oklch(1 0 0 / 10%) dark:bg-oklch(0.145 0 0) dark:hover:bg-oklch(0.269 0 0) dark:hover:text-oklch(0.985 0 0) dark:aria-expanded:bg-oklch(0.269 0 0) dark:aria-expanded:text-oklch(0.985 0 0) dark:dark:border-oklch(1 0 0 / 15%) dark:dark:bg-oklch(1 0 0 / 15%)/30 dark:dark:hover:bg-oklch(1 0 0 / 15%)/50',
				secondary:
					'bg-oklch(0.97 0 0) text-oklch(0.205 0 0) hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-oklch(0.97 0 0) aria-expanded:text-oklch(0.205 0 0) dark:bg-oklch(0.269 0 0) dark:text-oklch(0.985 0 0) dark:aria-expanded:bg-oklch(0.269 0 0) dark:aria-expanded:text-oklch(0.985 0 0)',
				ghost:
					'hover:bg-oklch(0.97 0 0) hover:text-oklch(0.145 0 0) aria-expanded:bg-oklch(0.97 0 0) aria-expanded:text-oklch(0.145 0 0) dark:hover:bg-oklch(0.97 0 0)/50 dark:hover:bg-oklch(0.269 0 0) dark:hover:text-oklch(0.985 0 0) dark:aria-expanded:bg-oklch(0.269 0 0) dark:aria-expanded:text-oklch(0.985 0 0) dark:dark:hover:bg-oklch(0.269 0 0)/50',
				destructive:
					'bg-oklch(0.577 0.245 27.325)/10 text-oklch(0.577 0.245 27.325) hover:bg-oklch(0.577 0.245 27.325)/20 focus-visible:border-oklch(0.577 0.245 27.325)/40 focus-visible:ring-oklch(0.577 0.245 27.325)/20 dark:bg-oklch(0.577 0.245 27.325)/20 dark:hover:bg-oklch(0.577 0.245 27.325)/30 dark:focus-visible:ring-oklch(0.577 0.245 27.325)/40 dark:bg-oklch(0.704 0.191 22.216)/10 dark:text-oklch(0.704 0.191 22.216) dark:hover:bg-oklch(0.704 0.191 22.216)/20 dark:focus-visible:border-oklch(0.704 0.191 22.216)/40 dark:focus-visible:ring-oklch(0.704 0.191 22.216)/20 dark:dark:bg-oklch(0.704 0.191 22.216)/20 dark:dark:hover:bg-oklch(0.704 0.191 22.216)/30 dark:dark:focus-visible:ring-oklch(0.704 0.191 22.216)/40',
				link: 'text-oklch(0.205 0 0) underline-offset-4 hover:underline dark:text-oklch(0.922 0 0)',
			},
			size: {
				default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				xl: 'min-h-10.5 gap-2 px-4 py-2 text-body',
				icon: 'size-8',
				'icon-xs':
					"size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
				'icon-lg': 'size-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

function Button({
	className,
	variant = 'default',
	size = 'default',
	asChild = false,
	...props
}: React.ComponentProps<'button'> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : 'button';

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={
				variant === 'unstyled'
					? cn('cursor-pointer disabled:cursor-not-allowed disabled:opacity-50', className)
					: cn(buttonVariants({ variant, size, className }))
			}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
