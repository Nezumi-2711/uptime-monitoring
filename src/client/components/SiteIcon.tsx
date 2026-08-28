import { Database } from "lucide-react";
import { useState } from "react";

type SiteIconProps = {
	monitorId: number;
};

export function SiteIcon({ monitorId }: SiteIconProps) {
	const [failed, setFailed] = useState(false);

	if (failed) return <Database aria-hidden="true" />;

	return (
		<img
			src={`/api/monitors/${monitorId}/favicon`}
			alt=""
			width={22}
			height={22}
			loading="lazy"
			onError={() => setFailed(true)}
		/>
	);
}
