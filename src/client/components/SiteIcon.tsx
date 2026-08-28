import { Database } from 'lucide-react';
import { useState } from 'react';

type SiteIconProps = {
	monitorId: number;
	favicon?: 'admin' | 'public';
};

export function SiteIcon({ monitorId, favicon = 'admin' }: SiteIconProps) {
	const [failed, setFailed] = useState(false);

	if (failed) return <Database aria-hidden="true" />;

	return (
		<img
			src={favicon === 'public' ? `/api/status/${monitorId}/favicon` : `/api/monitors/${monitorId}/favicon`}
			alt=""
			width={22}
			height={22}
			loading="lazy"
			onError={() => setFailed(true)}
		/>
	);
}
