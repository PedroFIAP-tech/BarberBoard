// Formas de pagamento aceitas (mesmos valores do enum PaymentMethod do banco).

export const PAYMENT_METHODS = ["PIX", "CASH", "DEBIT", "CREDIT"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];
