<script setup lang="ts">
import { ref } from "vue";
import { addItem } from "../lib/cart";

const props = defineProps<{
  productSlug: string;
  productName: string;
  productSku: string;
}>();

const qty = ref(1);
const notes = ref("");
const message = ref("");

const basePrice = 1 + Math.random() * 1;

function decrease() {
  if (qty.value > 1) {
    qty.value -= 1;
  }
}

function increase() {
  qty.value += 1;
}

function handleAdd() {
  if (!props.productSlug || !props.productName || !props.productSku) return;

  const partNumber = `${props.productSku}-CONF`;
  const options = [{ code: "example", value: "value" }];

  addItem({
    productSlug: props.productSlug,
    productName: props.productName,
    baseSku: props.productSku,
    partNumber,
    price: basePrice,
    qty: qty.value,
    options,
    notes: notes.value.trim() || undefined,
  });

  message.value =
    'Item added to cart. <a href="/cart" class="underline">View cart</a>.';
}
</script>

<template>
  <section class="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
    <h2 class="mb-3 text-lg font-semibold text-slate-900">Add to cart (PoC)</h2>
    <p class="mb-3 text-sm text-slate-700">
      This is a simple proof-of-concept configurator. It will create a configured part
      number based on the base SKU and add it to your cart.
    </p>

    <div class="mb-3 flex items-center gap-2 text-sm">
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-900"
        @click="decrease"
      >
        -
      </button>
      <span class="min-w-[3rem] text-center text-sm font-medium">
        {{ qty }}
      </span>
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-900"
        @click="increase"
      >
        +
      </button>
    </div>

    <div class="mb-3">
      <label class="mb-1 block text-xs font-medium text-slate-700">
        Notes (optional)
      </label>
      <textarea
        rows="3"
        class="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
        v-model="notes"
      ></textarea>
    </div>

    <button
      type="button"
      class="mb-2 inline-flex w-full items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-50 hover:bg-slate-800"
      @click="handleAdd"
    >
      Add configured item to cart
    </button>

    <p class="text-xs text-slate-700" v-html="message"></p>
  </section>
</template>

