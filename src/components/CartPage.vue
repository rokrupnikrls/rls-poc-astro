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
  <main>
    <h1>Cart</h1>

    <p id="cart-summary">
      <span v-if="count === 0">Your cart is empty.</span>
      <span v-else> Total items: {{ count }} </span>
    </p>

    <div id="cart-items">
      <article v-for="item in items" :key="item.id" class="mb-4 border p-2">
        <h2>{{ item.productName }}</h2>
        <p>Part: {{ item.partNumber }}</p>
        <p>Price: ${{ (Number.isFinite(item.price) ? Number(item.price) : 0).toFixed(2) }}</p>
        <p v-if="item.baseSku">Base SKU: {{ item.baseSku }}</p>
        <p v-if="item.notes">Notes: {{ item.notes }}</p>

        <div v-if="item.options.length > 0">
          <p>Options:</p>
          <ul>
            <li v-for="opt in item.options" :key="opt.code">
              {{ opt.code }}: {{ opt.value }}
            </li>
          </ul>
        </div>

        <div class="mt-2 flex items-center gap-2">
          <button type="button" @click="handleDelta(item, -1)">-</button>
          <span>Qty: {{ item.qty }}</span>
          <button type="button" @click="handleDelta(item, 1)">+</button>
        </div>

        <button type="button" class="mt-2" @click="handleRemove(item)">Remove</button>
      </article>
    </div>

    <div id="cart-actions">
      <div id="checkout-details">
        <label for="customer-email">Email for receipt and order confirmation</label>
        <input
          id="customer-email"
          type="email"
          name="customer-email"
          autocomplete="email"
          required
          v-model="customerEmail"
        />
      </div>
      <div id="checkout-buttons">
        <button id="clear-cart" type="button" @click="handleClear">Clear cart</button>
        <button id="pay-now" type="button" :disabled="isSubmitting" @click="handlePayNow">
          {{ isSubmitting ? "Redirecting…" : "Pay Now" }}
        </button>
        <a href="/checkout">Proceed</a>
      </div>
    </div>
  </main>
</template>

