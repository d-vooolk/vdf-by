import { cookies } from "next/headers";
import { cache } from "react";

import {
  actingAs,
  createCustomerSession,
  customerBySession,
  deleteCustomerSession,
  type Customer,
} from "./customers";
import { NO_ANALYTICS_COOKIE, NO_ANALYTICS_MAX_AGE } from "./analytics";
import { parseSellerMode, SELLER_MODE_COOKIE, type SellerMode } from "./seller-mode";

const COOKIE = "vdf_customer";
export const SIGNED_IN_COOKIE = "vdf_signed";

export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? customerBySession(token) : null;
});

export const getSellerMode = cache(async (): Promise<SellerMode> =>
  parseSellerMode((await cookies()).get(SELLER_MODE_COOKIE)?.value),
);

export const getActingCustomer = cache(async (): Promise<Customer | null> => {
  const customer = await getCustomer();
  return customer?.seller ? actingAs(customer, await getSellerMode()) : customer;
});

export async function signInCustomer(customerId: number): Promise<void> {
  const { token, expiresAt } = createCustomerSession(customerId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  (await cookies()).set(SIGNED_IN_COOKIE, "1", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function signOutCustomer(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteCustomerSession(token);
  store.delete(COOKIE);
  store.delete(SIGNED_IN_COOKIE);
}

export async function excludeFromAnalytics(): Promise<void> {
  (await cookies()).set(NO_ANALYTICS_COOKIE, "1", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: NO_ANALYTICS_MAX_AGE,
  });
}
