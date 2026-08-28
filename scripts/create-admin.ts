import { hashPassword } from '../src/worker/lib/password';

async function readPassword() {
	if (!process.stdin.isTTY) {
		return (await new Response(Bun.stdin.stream()).text()).trimEnd();
	}

	process.stdout.write('Password: ');
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	return new Promise<string>((resolve, reject) => {
		let password = '';
		const cleanup = () => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdout.write('\n');
		};

		process.stdin.on('data', (key: string) => {
			if (key === '\u0003') {
				cleanup();
				reject(new Error('Cancelled'));
				return;
			}
			if (key === '\r' || key === '\n') {
				cleanup();
				resolve(password);
				return;
			}
			if (key === '\u007f' || key === '\b') {
				password = password.slice(0, -1);
				return;
			}
			password += key;
		});
	});
}

function sqlValue(value: string) {
	return `'${value.replaceAll("'", "''")}'`;
}

function shellDoubleQuoted(value: string) {
	return value.replace(/[\\"$`]/g, '\\$&');
}

const password = await readPassword();
if (password.length < 8) {
	console.error('Password must contain at least 8 characters.');
	process.exit(1);
}

const now = Date.now();
const statement = [
	'INSERT OR REPLACE INTO admin_credentials',
	'(id, password_hash, created_at, updated_at)',
	`VALUES (1, ${sqlValue(await hashPassword(password))}, ${now}, ${now});`,
].join(' ');

console.log('\nLocal database:');
console.log(`bunx wrangler d1 execute uptime --local --command "${shellDoubleQuoted(statement)}"`);
console.log('\nRemote database:');
console.log(`bunx wrangler d1 execute uptime --remote --command "${shellDoubleQuoted(statement)}"`);
