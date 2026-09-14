import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const customTwMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			'font-size': [
				'text-2xs',
				'text-footnote',
				'text-micro',
				'text-caption',
				'text-body',
				'text-item',
				'text-body-md',
				'text-subtitle',
				'text-brand-title',
				'text-dialog-title',
				'text-title-compact',
				'text-title',
				'text-metric',
				'text-display-sm',
				'text-display',
			],
			'min-h': ['min-h-metric-h', 'min-h-row-h', 'min-h-skeleton-h', 'min-h-textarea-h', 'min-h-textarea-sm-h'],
			'max-h': ['max-h-skeleton-h'],
			'min-w': ['min-w-dialog-btn'],
			'max-w': ['max-w-dialog-max', 'max-w-select-max'],
			rounded: ['rounded-card-sm', 'rounded-actions', 'rounded-dialog'],
			tracking: ['tracking-display', 'tracking-title', 'tracking-brand', 'tracking-overline', 'tracking-metric'],
			leading: ['leading-title', 'leading-overline', 'leading-alert', 'leading-subtitle'],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return customTwMerge(clsx(inputs));
}
