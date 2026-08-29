import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				'peer inline-flex h-5.5 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[#dfdfdf] p-px transition-colors outline-none',
				'data-[state=checked]:border-[#35c586] data-[state=checked]:bg-(--primary)',
				'focus-visible:shadow-[0_0_0_3px_rgb(36_180_126/0.14)] focus-visible:outline-none!',
				'disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block size-4.5 translate-x-0 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.15)] transition-transform data-[state=checked]:translate-x-4.5"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
