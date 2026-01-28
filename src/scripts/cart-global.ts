import * as cart from "../lib/cart";

declare global {
  interface Window {
    rlsCart?: typeof cart;
  }
}

if (typeof window !== "undefined") {
  window.rlsCart = cart;
}

