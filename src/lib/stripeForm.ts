export type StripeFormPrimitive = string | number | boolean | null | undefined;

export type StripeFormValue =
	| StripeFormPrimitive
	| StripeFormValue[]
	| { [key: string]: StripeFormValue };

/**
 * Minimal helper to encode nested data into Stripe-style
 * application/x-www-form-urlencoded format.
 *
 * Examples:
 *   { mode: "payment" } -> "mode=payment"
 *   { line_items: [{ quantity: 1 }] } -> "line_items[0][quantity]=1"
 */
export function encodeStripeForm(data: Record<string, StripeFormValue>): string {
	const params = new URLSearchParams();

	const appendValue = (key: string, value: StripeFormPrimitive) => {
		if (value === undefined || value === null) return;
		params.append(key, String(value));
	};

	const walk = (prefix: string, value: StripeFormValue): void => {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean" ||
			value === null ||
			value === undefined
		) {
			appendValue(prefix, value);
			return;
		}

		if (Array.isArray(value)) {
			value.forEach((entry, index) => {
				const key = `${prefix}[${index}]`;
				walk(key, entry as StripeFormValue);
			});
			return;
		}

		const obj = value as { [key: string]: StripeFormValue };
		for (const [childKey, childVal] of Object.entries(obj)) {
			const nextPrefix = prefix ? `${prefix}[${childKey}]` : childKey;
			walk(nextPrefix, childVal);
		}
	};

	for (const [key, value] of Object.entries(data)) {
		walk(key, value);
	}

	return params.toString();
}

