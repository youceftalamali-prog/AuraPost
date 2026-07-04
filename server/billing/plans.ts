import {
  BillingPlanDefinition,
  CreditBucketName,
  SubscriptionInterval,
  SubscriptionPlanName,
} from "../../src/types.ts";

export const CREDIT_BUCKET_LABELS: Record<CreditBucketName, string> = {
  ai: "AI Credits",
  video: "Video Credits",
  publishing: "Publishing Credits",
};

export const BILLING_PLANS: BillingPlanDefinition[] = [
  {
    id: "free",
    label: "Free",
    description: "Explore the workspace with a lightweight starter allowance.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    aiCredits: 5,
    videoCredits: 3,
    publishingCredits: 2,
    trialDays: 7,
    features: [
      "Product imports and analysis",
      "Basic content generation",
      "Limited AI video renders",
      "Starter social publishing queue",
    ],
  },
  {
    id: "starter",
    label: "Starter",
    description: "For growing operators running weekly AI campaigns.",
    monthlyPrice: 29,
    yearlyPrice: 290,
    aiCredits: 60,
    videoCredits: 25,
    publishingCredits: 15,
    trialDays: 14,
    features: [
      "Full content studio access",
      "Short-form video generation",
      "Publishing calendar and queue",
      "Stripe billing portal access",
    ],
    stripePriceIds: {
      monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
      yearly: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,
    },
  },
  {
    id: "pro",
    label: "Pro",
    description: "For brands running always-on AI acquisition across channels.",
    monthlyPrice: 99,
    yearlyPrice: 990,
    aiCredits: 260,
    videoCredits: 160,
    publishingCredits: 80,
    trialDays: 14,
    features: [
      "Advanced analytics and brand intelligence",
      "Short-form and long-form video workflows",
      "Higher render concurrency and history",
      "Priority billing support",
    ],
    stripePriceIds: {
      monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    },
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "For multi-brand teams needing larger usage ceilings and controls.",
    monthlyPrice: 299,
    yearlyPrice: 2990,
    aiCredits: 1000,
    videoCredits: 600,
    publishingCredits: 300,
    trialDays: 30,
    features: [
      "Largest AI, video, and publishing pools",
      "Enterprise billing controls",
      "Priority lifecycle support",
      "Designed for multi-team scale",
    ],
    stripePriceIds: {
      monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
      yearly: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    },
  },
];

export function getBillingPlans(): BillingPlanDefinition[] {
  return BILLING_PLANS;
}

export function getBillingPlan(planId: SubscriptionPlanName): BillingPlanDefinition {
  const plan = BILLING_PLANS.find((item) => item.id === planId);
  if (!plan) {
    throw new Error(`Unknown billing plan: ${planId}`);
  }
  return plan;
}

export function getPlanPrice(planId: SubscriptionPlanName, interval: SubscriptionInterval): number {
  const plan = getBillingPlan(planId);
  return interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}
