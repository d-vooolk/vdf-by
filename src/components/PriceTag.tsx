"use client";

import { formatPrice } from "@/lib/format";
import { useWholesalePrice } from "@/store/account";

export function PriceTag({
  variantKey,
  price,
  prefix = "",
  currencySymbol,
  className,
  wholesaleClassName,
  retailClassName,
}: {
  variantKey: string;
  price: number;
  prefix?: string;
  currencySymbol: string;
  className: string;
  wholesaleClassName?: string;
  retailClassName: string;
}) {
  const wholesale = useWholesalePrice(variantKey);

  if (wholesale === null || wholesale <= 0) {
    return (
      <span className={className}>
        {prefix}
        {formatPrice(price, currencySymbol)}
      </span>
    );
  }

  return (
    <>
      <span className={wholesaleClassName ?? className}>
        {formatPrice(wholesale, currencySymbol)}
        <span className="ml-1 align-middle text-[10px] font-medium tracking-wide text-green-700 uppercase sm:text-xs">
          опт
        </span>
      </span>
      {price > 0 && (
        <span className={retailClassName}>{formatPrice(price, currencySymbol)}</span>
      )}
    </>
  );
}
