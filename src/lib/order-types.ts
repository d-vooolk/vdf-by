/**
 * Типы заказа и список статусов.
 *
 * Модуль намеренно без обращений к базе: его импортируют и серверные страницы,
 * и клиентские компоненты админки (переключатель статуса, цветная метка). Если
 * бы статусы лежали рядом с запросами, вместе с ними в браузерный бандл уехал
 * бы драйвер SQLite — сборка на этом и падает.
 *
 * Тот же приём, что с картинками: image-types.ts против images.ts.
 */

export const ORDER_STATUSES = [
  { id: "new", name: "Новый" },
  { id: "called", name: "Созвонились" },
  { id: "shipped", name: "Отправлен" },
  { id: "done", name: "Выполнен" },
  { id: "cancelled", name: "Отменён" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["id"];

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.some((status) => status.id === value);
}

export interface OrderItem {
  key: string;
  title: string;
  options: string;
  sku: string | null;
  qty: number;
  price: number;
  sum: number;
  url: string;
}

export interface Order {
  id: number;
  createdAt: number;
  status: OrderStatus;
  name: string;
  phone: string;
  phoneDigits: string;
  email: string;
  consentAt: number | null;
  comment: string;
  deliveryId: string;
  deliveryName: string;
  address: string;
  deliveryCost: number;
  subtotal: number;
  total: number;
  currency: string;
  items: OrderItem[];
  /** Расхождения с прайсом, замеченные при приёме заявки. */
  notes: string[];
  ip: string;
  referer: string;
  telegramSent: boolean;
  adminNote: string;
}
