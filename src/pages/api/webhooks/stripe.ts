import type { APIRoute } from "astro";

export const prerender = false;

type StripeEvent = {
	id: string;
	type: string;
	data: {
		object: any;
	};
};

type CompactItem = {
	pn: string;
	q: number;
	up: number;
	c: string;
	o?: string;
	n: string;
};

type CompactCart = {
	email?: string;
	items?: CompactItem[];
};

function getEnv(key: string): string {
	const value = (import.meta as any).env?.[key];
	if (!value || typeof value !== "string") {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

async function verifyStripeSignature(
	rawBody: string,
	signatureHeader: string | null,
	secret: string,
): Promise<boolean> {
	if (!signatureHeader) return false;

	const parts = signatureHeader.split(",").map((p) => p.trim());
	let timestamp: string | null = null;
	const v1s: string[] = [];

	for (const part of parts) {
		const [k, v] = part.split("=", 2);
		if (!k || !v) continue;
		if (k === "t") timestamp = v;
		if (k === "v1") v1s.push(v);
	}

	if (!timestamp || v1s.length === 0) {
		return false;
	}

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{
			name: "HMAC",
			hash: "SHA-256",
		},
		false,
		["sign"],
	);

	const payload = `${timestamp}.${rawBody}`;
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(payload),
	);

	const bytes = new Uint8Array(signature);
	const computed = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	for (const candidate of v1s) {
		if (timingSafeEqual(computed, candidate)) {
			return true;
		}
	}

	return false;
}

async function shopifyFetch(
	path: string,
	opts: { method?: string; body?: unknown },
) {
	const storeDomain = getEnv("SHOPIFY_STORE_DOMAIN");
	const token = getEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
	const apiVersion =
		(import.meta as any).env?.SHOPIFY_API_VERSION ?? "2024-10";

	const url = `https://${storeDomain}/admin/api/${apiVersion}${path}`;

	const response = await fetch(url, {
		method: opts.method ?? "GET",
		headers: {
			"X-Shopify-Access-Token": token,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: opts.body ? JSON.stringify(opts.body) : undefined,
	});

	if (!response.ok) {
		const text = await response.text();
		console.error("Shopify API error", response.status, path, text);
		throw new Error(`Shopify API error: ${response.status}`);
	}

	return response.json();
}

async function findOrCreateShopifyCustomer(email: string | undefined) {
	if (!email) return null;

	try {
		const searchQuery = encodeURIComponent(`email:${email}`);
		const result = await shopifyFetch(
			`/customers/search.json?query=${searchQuery}`,
			{},
		);

		const customers = (result as any).customers ?? [];
		if (customers.length > 0) {
			return customers[0];
		}

		const createResult = await shopifyFetch("/customers.json", {
			method: "POST",
			body: {
				customer: {
					email,
				},
			},
		});

		return (createResult as any).customer ?? null;
	} catch (err) {
		console.error("Shopify customer upsert failed", err);
		return null;
	}
}

function parseCompactCart(metadata: any): CompactCart | null {
	if (!metadata || typeof metadata !== "object") return null;
	const raw = (metadata as any).cart_compact;
	if (!raw || typeof raw !== "string") return null;

	try {
		const parsed = JSON.parse(raw) as CompactCart;
		if (!parsed || typeof parsed !== "object") return null;
		return parsed;
	} catch (err) {
		console.error("Failed to parse cart_compact metadata", err);
		return null;
	}
}

async function createShopifyOrderFromStripe(
	event: StripeEvent,
): Promise<void> {
	const session = event.data.object;
	const customerEmail: string | undefined = session.customer_email ?? undefined;
	const compact = parseCompactCart(session.metadata ?? {});

	const items = compact?.items ?? [];
	if (!items.length) {
		console.warn(
			"Stripe webhook: no items found in cart_compact metadata for session",
			session.id,
		);
		return;
	}

	const customer = await findOrCreateShopifyCustomer(
		compact?.email ?? customerEmail,
	);

	const line_items = items.map((item) => {
		const optionsPairs =
			item.o && typeof item.o === "string" && item.o.length > 0
				? item.o.split("|").filter(Boolean)
				: [];

		const properties: { name: string; value: string }[] = [
			{ name: "partNumber", value: item.pn },
			{
				name: "unit_price_cents",
				value: String(item.up),
			},
			{
				name: "options_json",
				value: JSON.stringify(
					optionsPairs.map((pair) => {
						const [code, value] = pair.split(":", 2);
						return { code, value };
					}),
				),
			},
		];

		for (const pair of optionsPairs) {
			const [code, value] = pair.split(":", 2);
			if (!code || !value) continue;
			properties.push({
				name: `opt_${code}`,
				value,
			});
		}

		return {
			title: `${item.n} (${item.pn})`,
			quantity: item.q,
			price: (item.up / 100).toFixed(2),
			properties,
		};
	});

	const note = `Paid via Stripe session ${session.id}, payment_intent ${session.payment_intent ?? "n/a"}`;

	const orderPayload: any = {
		order: {
			email: compact?.email ?? customerEmail,
			financial_status: "paid",
			line_items,
			note,
			note_attributes: [
				{
					name: "stripe_session_id",
					value: session.id,
				},
				{
					name: "stripe_payment_intent",
					value: String(session.payment_intent ?? ""),
				},
			],
		},
	};

	if (customer && customer.id) {
		orderPayload.order.customer_id = customer.id;
	}

	try {
		await shopifyFetch("/orders.json", {
			method: "POST",
			body: orderPayload,
		});
	} catch (err) {
		console.error("Failed to create Shopify order from Stripe webhook", err);
	}
}

export const POST: APIRoute = async ({ request }) => {
	let webhookSecret: string;
	try {
		webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
	} catch (err) {
		console.error(err);
		return new Response("Webhook misconfigured", { status: 500 });
	}

	const rawBody = await request.text();
	const sigHeader =
		request.headers.get("stripe-signature") ??
		request.headers.get("Stripe-Signature");

	const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);

	if (!valid) {
		console.warn("Invalid Stripe webhook signature");
		return new Response("Signature verification failed", { status: 400 });
	}

	let event: StripeEvent;
	try {
		event = JSON.parse(rawBody) as StripeEvent;
	} catch (err) {
		console.error("Failed to parse Stripe webhook JSON", err);
		return new Response("Invalid JSON", { status: 400 });
	}

	try {
		if (event.type === "checkout.session.completed") {
			await createShopifyOrderFromStripe(event);
		}
	} catch (err) {
		console.error("Error handling Stripe webhook", err);
		// Intentionally still return 200 to avoid repeated retries
	}

	return new Response("ok", { status: 200 });
};

