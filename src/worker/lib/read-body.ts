export async function readBodyLimited(response: Response, maximum: number, truncate: boolean) {
	if (!response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let exceeded = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const remaining = maximum - total;
			if (value.byteLength > remaining) {
				if (truncate && remaining > 0) {
					chunks.push(value.subarray(0, remaining));
					total += remaining;
				}
				exceeded = true;
				await reader.cancel();
				break;
			}
			chunks.push(value);
			total += value.byteLength;
		}
	} catch {
		return null;
	}

	if (exceeded && !truncate) return null;
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body.buffer;
}
