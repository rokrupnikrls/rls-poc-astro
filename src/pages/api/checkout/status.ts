import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("session_id");

	if (!sessionId) {
		return new Response(JSON.stringify({ error: "session_id is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const runtimeEnv = (locals as any)?.runtime?.env ?? {};
	const stripeSecret = runtimeEnv.STRIPE_SECRET_KEY;
	if (!stripeSecret || typeof stripeSecret !== "string") {
		console.error("Missing STRIPE_SECRET_KEY in runtime env for status endpoint");
		return new Response(
			JSON.stringify({
				error: "Server misconfiguration (status): Missing STRIPE_SECRET_KEY",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
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

