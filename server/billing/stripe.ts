import Stripe from "stripe";
import {
  SubscriptionInterval,
  SubscriptionPlanName,
} from "../../src/types.ts";
import { getBillingPlan, getPlanPrice } from "./plans.ts";

interface CheckoutSessionInput {
  workspaceId: string;
  workspaceName: string;
  plan: SubscriptionPlanName;
  interval: SubscriptionInterval;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  stripeCustomerId?: string;
}

interface CheckoutSessionResult {
  sessionId: string;
  stripeRedirectUrl: string;
  mode: "sandbox" | "live";
}

interface PortalSessionInput {
  workspaceId: string;
  returnUrl: string;
  stripeCustomerId?: string;
}

interface PortalSessionResult {
  url: string;
  mode: "sandbox" | "live";
}

export function getStripeMode(): "sandbox" | "live" {
  return process.env.STRIPE_SECRET_KEY ? "live" : "sandbox";
}

function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    const sessionId = `cs_sandbox_${Date.now()}`;
    return {
      sessionId,
      stripeRedirectUrl: `${input.successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId)}&mode=sandbox&plan=${input.plan}`,
      mode: "sandbox",
    };
  }

  const plan = getBillingPlan(input.plan);
  const priceId = plan.stripePriceIds?.[input.interval];
  const session = await stripe.checkout.sessions.create({
    mode: input.plan === "free" ? "setup" : "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer: input.stripeCustomerId,
    customer_email: input.customerEmail,
    metadata: {
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
      plan: input.plan,
      interval: input.interval,
    },
    ...(input.plan === "free"
      ? {}
      : priceId
        ? { line_items: [{ price: priceId, quantity: 1 }] }
        : {
            line_items: [{
              price_data: {
                currency: "usd",
                recurring: { interval: input.interval === "yearly" ? "year" : "month" },
                product_data: {
                  name: `${plan.label} Plan`,
                  description: plan.description,
                },
                unit_amount: Math.round(getPlanPrice(input.plan, input.interval) * 100),
              },
              quantity: 1,
            }],
          }),
  });

  return {
    sessionId: session.id,
    stripeRedirectUrl: session.url || input.successUrl,
    mode: "live",
  };
}

export async function createCustomerPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
  const stripe = getStripeClient();
  if (!stripe || !input.stripeCustomerId) {
    return {
      url: `${input.returnUrl}?workspaceId=${input.workspaceId}&portal=sandbox`,
      mode: "sandbox",
    };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: input.stripeCustomerId,
    return_url: input.returnUrl,
  });
  return {
    url: session.url,
    mode: "live",
  };
}

export function constructStripeWebhookEvent(body: Buffer, signature?: string): Stripe.Event | null {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret || !signature) {
    return null;
  }
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}
