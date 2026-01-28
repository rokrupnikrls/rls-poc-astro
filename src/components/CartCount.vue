<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { getItemCount } from "../lib/cart";

const count = ref(0);

function update() {
  try {
    count.value = getItemCount();
  } catch {
    count.value = 0;
  }
}

function handleStorage(ev: StorageEvent) {
  if (ev.key === "rls_cart_v1") {
    update();
  }
}

onMounted(() => {
  update();
  window.addEventListener("rls:cart-updated", update as EventListener);
  window.addEventListener("storage", handleStorage);
});

onBeforeUnmount(() => {
  window.removeEventListener("rls:cart-updated", update as EventListener);
  window.removeEventListener("storage", handleStorage);
});
</script>

<template>
  <span>{{ count }}</span>
</template>

