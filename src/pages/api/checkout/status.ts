import type { APIRoute } from "astro";

export const prerender = false;

function getEnv(key: string): string {
	const value = (import.meta as any).env?.[key];
	if (!value || typeof value !== "string") {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("session_id");

	if (!sessionId) {
		return new Response(JSON.stringify({ error: "session_id is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	let stripeSecret: string;
	try {
		stripeSecret = getEnv("STRIPE_SECRET_KEY");
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Server misconfiguration (status): " + (err as Error).message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	const response = await fetch(
		`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${stripeSecret}`,
			},
		},
	);

	if (!response.ok) {
		const text = await response.text();
		console.error(
			"Stripe Checkout Session fetch error",
			response.status,
			text,
		);
		return new Response(
			JSON.stringify({
				error: "Failed to fetch Stripe Checkout Session",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const session = (await response.json()) as {
		id: string;
		payment_status?: string;
		payment_intent?: string;
	};

	const paid = session.payment_status === "paid";

	return new Response(
		JSON.stringify({
			paid,
			sessionId: session.id,
			paymentIntent: session.payment_intent ?? null,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
};

