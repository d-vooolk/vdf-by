import { cookies } from "next/headers";
import { cache } from "react";

import {
  createCustomerSession,
  customerBySession,
  deleteCustomerSession,
  type Customer,
} from "./customers";

const COOKIE = "vdf_customer";

export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? customerBySession(token) : null;
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
}

export async function signOutCustomer(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteCustomerSession(token);
  store.delete(COOKIE);
}
