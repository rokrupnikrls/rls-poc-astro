export type CartItemOption = {
  code: string;
  value: string;
};

export type CartItem = {
  id: string; // stable unique id per configured item
  productSlug: string; // storyblok slug e.g. "demo-product"
  productName: string; // from Storyblok content
  baseSku?: string; // optional
  partNumber: string; // final configured part number
  price: number;
  qty: number;
  options: CartItemOption[];
  notes?: string;
  createdAt: string; // ISO
};

export type CartState = {
  items: CartItem[];
};

const STORAGE_KEY = "rls_cart_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function notifyCartUpdated(): void {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent("rls:cart-updated"));
  } catch {
    // ignore
  }
}

function coerceCartState(maybeState: unknown): CartState {
  if (!maybeState || typeof maybeState !== "object") {
    return { items: [] };
  }

  const rawItems = (maybeState as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) {
    return { items: [] };
  }

  const items: CartItem[] = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Partial<CartItem>;

    if (
      typeof obj.id !== "string" ||
      typeof obj.productSlug !== "string" ||
      typeof obj.productName !== "string" ||
      typeof obj.partNumber !== "string" ||
      typeof obj.qty !== "number" ||
      !Array.isArray(obj.options) ||
      typeof obj.createdAt !== "string"
    ) {
      continue;
    }

    const options: CartItemOption[] = [];
    for (const opt of obj.options) {
      if (!opt || typeof opt !== "object") continue;
      const o = opt as Partial<CartItemOption>;
      if (typeof o.code === "string" && typeof o.value === "string") {
        options.push({ code: o.code, value: o.value });
      }
    }

    items.push({
      id: obj.id,
      productSlug: obj.productSlug,
      productName: obj.productName,
      baseSku: typeof obj.baseSku === "string" ? obj.baseSku : undefined,
      partNumber: obj.partNumber,
      price: typeof obj.price === "number" ? obj.price : 0,
      qty: obj.qty,
      options,
      notes: typeof obj.notes === "string" ? obj.notes : undefined,
      createdAt: obj.createdAt,
    });
  }

  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { items };
}

export function loadCart(): CartState {
  if (!isBrowser()) {
    return { items: [] };
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { items: [] };
  }

  if (!raw) {
    return { items: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    return coerceCartState(parsed);
  } catch {
    // Corrupted data: fall back to empty cart
    return { items: [] };
  }
}

export function saveCart(state: CartState): void {
  if (!isBrowser()) return;

  try {
    const normalized = coerceCartState(state);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    notifyCartUpdated();
  } catch {
    // ignore write errors
  }
}

function generateId(): string {
  // Prefer crypto.randomUUID when available
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as Crypto & { randomUUID(): string }).randomUUID();
    }
  } catch {
    // ignore
  }

  return `item_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isSameConfiguredItem(
  existing: CartItem,
  incoming: Omit<CartItem, "id" | "createdAt">
): boolean {
  if (existing.partNumber !== incoming.partNumber) return false;

  const existingNotes = existing.notes ?? "";
  const incomingNotes = incoming.notes ?? "";
  if (existingNotes !== incomingNotes) return false;

  if (existing.options.length !== incoming.options.length) return false;

  for (let i = 0; i < existing.options.length; i++) {
    const a = existing.options[i];
    const b = incoming.options[i];
    if (!b || a.code !== b.code || a.value !== b.value) {
      return false;
    }
  }

  return true;
}

export function addItem(
  item: Omit<CartItem, "id" | "createdAt">
): CartItem {
  const state = loadCart();

  const existing = state.items.find((it) => isSameConfiguredItem(it, item));
  if (existing) {
    existing.qty += item.qty;
    saveCart(state);
    return existing;
  }

  const newItem: CartItem = {
    ...item,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  state.items.push(newItem);
  state.items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  saveCart(state);

  return newItem;
}

export function updateQty(itemId: string, qty: number): void {
  const state = loadCart();
  const idx = state.items.findIndex((it) => it.id === itemId);
  if (idx === -1) return;

  if (qty <= 0) {
    state.items.splice(idx, 1);
  } else {
    state.items[idx].qty = Math.max(1, qty);
  }

  saveCart(state);
}

export function removeItem(itemId: string): void {
  const state = loadCart();
  const nextItems = state.items.filter((it) => it.id !== itemId);
  if (nextItems.length === state.items.length) return;

  saveCart({ items: nextItems });
}

export function clearCart(): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }

  notifyCartUpdated();
}

export function getItemCount(): number {
  const state = loadCart();
  return state.items.reduce((sum, item) => {
    const n = Number(item.qty);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

