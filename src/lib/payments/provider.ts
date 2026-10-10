import { randomBytes } from "node:crypto";

/**
 * Payment providers. "dev" is a stand-in for Stripe Checkout used until the
 * Stripe account is connected: it shows a test payment page on this site and
 * reports the result through the same code path the Stripe webhook will use
 * (lib/orders/checkout.ts → completeCheckout / expireCheckout).
 */

export interface CheckoutRequest {
  rentalId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
  locale: "en" | "sk";
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface PaymentProvider {
  readonly name: "dev" | "stripe";
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Stop a session that has not been paid (a newer one replaces it). */
  expireCheckout(sessionId: string): Promise<void>;
  refund(paymentRef: string, amountCents: number): Promise<void>;
}

const devProvider: PaymentProvider = {
  name: "dev",
  async createCheckout(request) {
    const sessionId = `dev_${randomBytes(18).toString("base64url")}`;
    const prefix = request.locale === "sk" ? "/sk" : "";
    return { sessionId, url: `${prefix}/dev/checkout/${sessionId}` };
  },
  async expireCheckout() {
    // Nothing to tell anyone: the test session lives only in our database.
  },
  async refund() {
    // No real money moved.
  },
};

export function isDevPaymentsAllowed(): boolean {
  return process.env.APP_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

export function paymentProvider(): PaymentProvider {
  const kind = process.env.PAYMENT_PROVIDER ?? "dev";
  if (kind === "dev") {
    if (!isDevPaymentsAllowed()) throw new Error("The test payment provider cannot be used in production.");
    return devProvider;
  }
  if (kind === "stripe") throw new Error("Stripe is not connected yet (planned once the Stripe account exists).");
  throw new Error(`Unknown PAYMENT_PROVIDER "${kind}"`);
}
