const HASH_ALGORITHM = 'SHA-256';
const HASH_BYTES = 32;
const SALT_BYTES = 16;

// Kept conservative for the Workers Free plan. Increase this after raising the
// Worker CPU limit and re-hash the admin password.
export const PBKDF2_ITERATIONS = 25_000;

function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(plain: string, salt: ArrayBuffer, iterations: number) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);

	return new Uint8Array(
		await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				hash: HASH_ALGORITHM,
				salt,
				iterations,
			},
			key,
			HASH_BYTES * 8,
		),
	);
}

export async function hashPassword(plain: string) {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derivePassword(plain, Uint8Array.from(salt).buffer, PBKDF2_ITERATIONS);

	return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(plain: string, stored: string) {
	const [scheme, digest, iterationValue, saltValue, hashValue, ...extra] = stored.split('$');
	const iterations = Number(iterationValue);

	if (
		scheme !== 'pbkdf2' ||
		digest !== 'sha256' ||
		extra.length > 0 ||
		!Number.isSafeInteger(iterations) ||
		iterations < 1 ||
		iterations > 1_000_000 ||
		!saltValue ||
		!hashValue
	) {
		return false;
	}

	try {
		const salt = base64ToBytes(saltValue);
		const expected = base64ToBytes(hashValue);
		if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;

		const actual = await derivePassword(plain, Uint8Array.from(salt).buffer, iterations);
		const subtle = crypto.subtle as SubtleCrypto & {
			timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean;
		};
		return subtle.timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}
