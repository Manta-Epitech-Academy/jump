import puppeteer, { type Browser } from 'puppeteer';

const IDLE_TIMEOUT_MS = 60_000;

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let activePages = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function getBrowser(): Promise<Browser> {
	if (browser?.connected) return browser;

	if (!launching) {
		launching = puppeteer
			.launch({
				headless: true,
				executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-gpu',
					'--no-zygote'
				]
			})
			.then((b) => {
				browser = b;
				launching = null;
				return b;
			})
			.catch((err) => {
				launching = null;
				throw err;
			});
	}

	return launching;
}

function scheduleShutdown() {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(async () => {
		if (activePages === 0 && browser) {
			await browser.close();
			browser = null;
		}
	}, IDLE_TIMEOUT_MS);
}

export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
	if (idleTimer) clearTimeout(idleTimer);
	activePages++;
	const b = await getBrowser();
	try {
		return await fn(b);
	} finally {
		activePages--;
		if (activePages === 0) scheduleShutdown();
	}
}
