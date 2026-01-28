<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { CartItem, CartState } from "../lib/cart";
import { clearCart, getItemCount, loadCart, removeItem, updateQty } from "../lib/cart";

type CheckoutItem = {
  productName: string;
  baseSku?: string;
  partNumber: string;
  qty: number;
  options: CartItem["options"];
  unitPriceCents: number;
  currency: string;
  notes?: string;
};

const DEFAULT_CURRENCY = "EUR";

const items = ref<CartItem[]>([]);
const customerEmail = ref("");
const isSubmitting = ref(false);

// Derive count from local items so SSR (empty cart) and
// initial client render match; we load real cart onMounted.
const count = computed(() =>
  items.value.reduce((sum, item) => {
    const n = Number(item.qty);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0),
);

function refresh() {
  const state: CartState = loadCart();
  items.value = state.items;
}

function handleDelta(item: CartItem, delta: number) {
  const newQty = item.qty + delta;
  updateQty(item.id, newQty);
  refresh();
}

function handleRemove(item: CartItem) {
  removeItem(item.id);
  refresh();
}

async function handlePayNow() {
  const email = customerEmail.value.trim();
  if (!email) {
    alert("Please enter your email address.");
    return;
  }
  if (!email.includes("@")) {
    alert("Please enter a valid email address.");
    return;
  }

  const state: CartState = loadCart();
  if (!state.items || state.items.length === 0) {
    alert("Your cart is empty.");
    return;
  }

  const itemsForCheckout: CheckoutItem[] = state.items.map((item) => {
    const priceNumber = Number.isFinite(item.price) ? Number(item.price) : 0;
    const unitPriceCents = Math.max(1, Math.round(priceNumber * 100) || 10000);

    return {
      productName: item.productName,
      baseSku: item.baseSku,
      partNumber: item.partNumber,
      qty: item.qty,
      options: item.options ?? [],
      unitPriceCents,
      currency: DEFAULT_CURRENCY,
      notes: item.notes,
    };
  });

  const payload = {
    customerEmail: email,
    items: itemsForCheckout,
    locale: typeof navigator !== "undefined" ? navigator.language : undefined,
  };

  isSubmitting.value = true;

  try {
    const response = await fetch("/api/checkout/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData && errorData.error
          ? errorData.error
          : "Failed to start checkout. Please try again.";
      alert(message);
      return;
    }

    const data = await response.json();
    if (data && data.url) {
      window.location.href = data.url;
    } else {
      alert("Unexpected response from checkout. Please try again.");
    }
  } catch (err) {
    console.error("Error creating checkout session", err);
    alert("An error occurred while starting checkout. Please try again.");
  } finally {
    isSubmitting.value = false;
  }
}

function handleClear() {
  clearCart();
  refresh();
}

onMounted(() => {
  refresh();
  window.addEventListener("rls:cart-updated", refresh as EventListener);
  window.addEventListener("storage", (ev) => {
    if (ev.key === "rls_cart_v1") {
      refresh();
    }
  });
});
</script>

<template>
  <main class="mx-auto max-w-4xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Cart</h1>
        <p id="cart-summary" class="mt-1 text-sm text-slate-600">
          <span v-if="count === 0">Your cart is empty.</span>
          <span v-else> Total items: {{ count }} </span>
        </p>
      </div>

      <a
        href="/product/demo-product"
        class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900"
      >
        ← Back to demo product
      </a>
    </header>

    <section
      id="cart-items"
      class="mb-8 space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm"
    >
      <p v-if="items.length === 0" class="text-sm text-slate-600">
        Add a configuration from the demo product page to see it here.
      </p>

      <article
        v-for="item in items"
        :key="item.id"
        class="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="space-y-1">
            <h2 class="text-sm font-semibold text-slate-900">
              {{ item.productName }}
            </h2>
            <p class="text-xs text-slate-600">Part: {{ item.partNumber }}</p>
            <p class="text-xs text-slate-600">
              Price:
              <span class="font-medium">
                ${{ (Number.isFinite(item.price) ? Number(item.price) : 0).toFixed(2) }}
              </span>
            </p>
            <p v-if="item.baseSku" class="text-xs text-slate-600">
              Base SKU: <span class="font-mono">{{ item.baseSku }}</span>
            </p>
            <p v-if="item.notes" class="text-xs text-slate-600">
              Notes: <span class="font-normal">{{ item.notes }}</span>
            </p>

            <div v-if="item.options.length > 0" class="pt-2">
              <p class="mb-1 text-xs font-medium text-slate-700">Options</p>
              <ul class="space-y-0.5 text-xs text-slate-600">
                <li v-for="opt in item.options" :key="opt.code">
                  <span class="font-mono text-[11px] uppercase tracking-wide text-slate-500">
                    {{ opt.code }}
                  </span>
                  <span class="mx-1 text-slate-400">•</span>
                  <span>{{ opt.value }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="flex flex-col items-end gap-3 md:items-stretch">
            <div class="inline-flex items-center justify-end gap-2 rounded-full bg-white px-2 py-1">
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                @click="handleDelta(item, -1)"
              >
                -
              </button>
              <span class="px-1 text-xs font-medium text-slate-800">
                Qty: {{ item.qty }}
              </span>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100"
                @click="handleDelta(item, 1)"
              >
                +
              </button>
            </div>

            <button
              type="button"
              class="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-100"
              @click="handleRemove(item)"
            >
              Remove item
            </button>
          </div>
        </div>
      </article>
    </section>

    <section
      id="cart-actions"
      class="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm"
    >
      <div id="checkout-details" class="space-y-2">
        <label
          for="customer-email"
          class="block text-sm font-medium text-slate-800"
        >
          Email for receipt and order confirmation
        </label>
        <input
          id="customer-email"
          type="email"
          name="customer-email"
          autocomplete="email"
          required
          v-model="customerEmail"
          class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
          placeholder="you@example.com"
        />
      </div>

      <div
        id="checkout-buttons"
        class="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex flex-wrap gap-3">
          <button
            id="clear-cart"
            type="button"
            class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50"
            @click="handleClear"
          >
            Clear cart
          </button>

          <button
            id="pay-now"
            type="button"
            :disabled="isSubmitting"
            class="inline-flex items-center justify-center rounded-full bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
            @click="handlePayNow"
          >
            {{ isSubmitting ? "Redirecting…" : "Pay now with Stripe" }}
          </button>
        </div>

        <button
          type="button"
          class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
          @click="$router?.push ? $router.push('/checkout') : (window.location.href = '/checkout')"
        >
          Go to order summary
        </button>
      </div>
    </section>
  </main>
</template>

