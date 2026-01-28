import type { APIRoute } from "astro";
import { encodeStripeForm } from "../../../lib/stripeForm";

export const prerender = false;

type CartItemOption = {
	code: string;
	value: string;
};

type CartItemInput = {
	productName: string;
	baseSku?: string;
	partNumber: string;
	qty: number;
	options: CartItemOption[];
	unitPriceCents: number;
	currency: string;
	notes?: string;
};

type RequestBody = {
	customerEmail: string;
	items: CartItemInput[];
	locale?: string;
};

function getEnv(key: string): string {
	const value = (import.meta as any).env?.[key];
	if (!value || typeof value !== "string") {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function validateRequestBody(body: unknown): RequestBody {
	if (!body || typeof body !== "object") {
		throw new Error("Invalid JSON body");
	}

	const { customerEmail, items, locale } = body as Partial<RequestBody>;

	if (!customerEmail || typeof customerEmail !== "string") {
		throw new Error("customerEmail is required");
	}

	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("items must be a non-empty array");
	}

	const normalizedItems: CartItemInput[] = [];

	for (const rawItem of items as CartItemInput[]) {
		if (!rawItem || typeof rawItem !== "object") {
			throw new Error("Invalid item in items array");
		}

		const {
			productName,
			baseSku,
			partNumber,
			qty,
			options,
			unitPriceCents,
			currency,
			notes,
		} = rawItem as Partial<CartItemInput>;

		if (!productName || typeof productName !== "string") {
			throw new Error("productName is required for each item");
		}
		if (!partNumber || typeof partNumber !== "string") {
			throw new Error("partNumber is required for each item");
		}
		if (typeof qty !== "number" || !Number.isFinite(qty) || qty < 1) {
			throw new Error("qty must be a positive number for each item");
		}
		if (
			typeof unitPriceCents !== "number" ||
			!Number.isInteger(unitPriceCents) ||
			unitPriceCents <= 0
		) {
			throw new Error("unitPriceCents must be a positive integer for each item");
		}
		if (!currency || typeof currency !== "string" || currency.length !== 3) {
			throw new Error("currency must be a 3-letter code for each item");
		}
		if (currency.toUpperCase() !== currency) {
			throw new Error("currency must be uppercase 3-letter code");
		}

		const safeOptions: CartItemOption[] = Array.isArray(options)
			? options
					.filter((opt): opt is CartItemOption => {
						return (
							!!opt &&
							typeof (opt as any).code === "string" &&
							typeof (opt as any).value === "string"
						);
					})
					.map((opt) => ({
						code: opt.code,
						value: opt.value,
					}))
			: [];

		normalizedItems.push({
			productName,
			baseSku: typeof baseSku === "string" ? baseSku : undefined,
			partNumber,
			qty,
			options: safeOptions,
			unitPriceCents,
			currency,
			notes: typeof notes === "string" ? notes : undefined,
		});
	}

	return {
		customerEmail,
		items: normalizedItems,
		locale: typeof locale === "string" ? locale : undefined,
	};
}

function buildCartCompactMetadata(input: RequestBody): string {
	const compactItems = input.items.map((item) => {
		return {
			pn: item.partNumber,
			q: item.qty,
			up: item.unitPriceCents,
			c: item.currency,
			o: item.options
				.map((opt) => `${opt.code}:${opt.value}`)
				.join("|")
				.slice(0, 200),
			n: item.productName,
		};
	});

	let compact = JSON.stringify({
		email: input.customerEmail,
		items: compactItems,
	});

	// Stripe metadata values are limited (~500 chars per field).
	if (compact.length > 4500) {
		compact = compact.slice(0, 4490) + "...";
	}

	return compact;
}

export const POST: APIRoute = async ({ request }) => {
	let parsed: RequestBody;
	try {
		const json = await request.json();
		parsed = validateRequestBody(json);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Invalid request payload";
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	let stripeSecret: string;
	let publicSiteUrl: string;
	try {
		stripeSecret = getEnv("STRIPE_SECRET_KEY");
		publicSiteUrl =
			(import.meta as any).env?.PUBLIC_SITE_URL ??
			(import.meta as any).env?.SITE ??
			"http://localhost:4321";
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	const cartMetadata = buildCartCompactMetadata(parsed);

	const firstCurrency = parsed.items[0]?.currency ?? "EUR";

	const lineItems = parsed.items.map((item) => {
		const optionsDesc =
			item.options && item.options.length > 0
				? item.options
						.slice(0, 4)
						.map((opt) => `${opt.code}: ${opt.value}`)
						.join(", ")
				: "";
		const descriptionParts = [`Part: ${item.partNumber}`];
		if (optionsDesc) {
			descriptionParts.push(`Options: ${optionsDesc}`);
		}
		if (item.notes) {
			descriptionParts.push(`Notes: ${item.notes}`);
		}

		return {
			price_data: {
				currency: item.currency.toLowerCase(),
				unit_amount: item.unitPriceCents,
				product_data: {
					name: item.productName,
					description: descriptionParts.join(" | ").slice(0, 500),
				},
			},
			quantity: item.qty,
		};
	});

	const payload = {
		mode: "payment",
		customer_email: parsed.customerEmail,
		success_url: `${publicSiteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${publicSiteUrl}/cart`,
		metadata: {
			cart_compact: cartMetadata,
		},
		// Stripe will infer currency per line item; this is here
		// to keep a primary currency reference if needed.
		currency: firstCurrency.toLowerCase(),
		line_items: lineItems,
		locale: parsed.locale,
	};

	const body = encodeStripeForm(payload as any);

	const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${stripeSecret}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!response.ok) {
		const text = await response.text();
		console.error("Stripe Checkout Session error", response.status, text);
		return new Response(
			JSON.stringify({
				error: "Failed to create Stripe Checkout Session",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const session = (await response.json()) as {
		id: string;
		url?: string;
	};

	if (!session.url) {
		console.error("Stripe session missing URL", session);
		return new Response(
			JSON.stringify({
				error: "Invalid Stripe response",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	return new Response(
		JSON.stringify({
			url: session.url,
			sessionId: session.id,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
};

