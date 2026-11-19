"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import { notifyOrderReadyAction, setOrderStatusAction } from "@/app/admin/order-actions";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-types";

export interface BoardOrder {
  id: number;
  status: OrderStatus;
  name: string;
  phone: string;
  total: number;
  createdAt: number;
  itemsCount: number;
  deliveryName: string;
  needsCheck: boolean;
  notSent: boolean;
  readySmsSent: boolean;
}

type ColumnStatus = Exclude<OrderStatus, "done">;

const COLUMNS = ORDER_STATUSES.filter((entry) => entry.id !== "done") as Array<{
  id: ColumnStatus;
  name: string;
}>;

const STATUS_NAMES = Object.fromEntries(ORDER_STATUSES.map((entry) => [entry.id, entry.name])) as Record<
  OrderStatus,
  string
>;

const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const DRAG_THRESHOLD = 6;
const TOUCH_HOLD_MS = 220;
const EDGE_SCROLL = 72;

interface Drag {
  order: BoardOrder;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  target: OrderStatus | null;
}

interface Pending {
  order: BoardOrder;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  rect: DOMRect;
  timer: number | null;
  armed: boolean;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function byNewest(a: BoardOrder, b: BoardOrder): number {
  return b.createdAt - a.createdAt || b.id - a.id;
}

export function OrderBoard({
  orders: initialOrders,
  doneTotal: initialDoneTotal,
  currencySymbol,
  smsReady,
}: {
  orders: BoardOrder[];
  doneTotal: number;
  currencySymbol: string;
  smsReady: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [orders, setOrders] = useState(initialOrders);
  const [doneTotal, setDoneTotal] = useState(initialDoneTotal);
  const [known, setKnown] = useState({ orders: initialOrders, doneTotal: initialDoneTotal });
  if (known.orders !== initialOrders || known.doneTotal !== initialDoneTotal) {
    setKnown({ orders: initialOrders, doneTotal: initialDoneTotal });
    setOrders(initialOrders);
    setDoneTotal(initialDoneTotal);
  }

  const [drag, setDrag] = useState<Drag | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");
  const [doneFlash, setDoneFlash] = useState(0);
  const [smsOrder, setSmsOrder] = useState<BoardOrder | null>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsProblem, setSmsProblem] = useState("");

  const scroller = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const doneZone = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<number, HTMLElement>());
  const before = useRef<Map<number, DOMRect> | null>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const snapshot = (overrides?: Map<number, DOMRect>) => {
    const rects = new Map<number, DOMRect>();
    for (const [id, node] of nodes.current) rects.set(id, node.getBoundingClientRect());
    for (const [id, rect] of overrides ?? []) rects.set(id, rect);
    before.current = rects;
  };

  useLayoutEffect(() => {
    const previous = before.current;
    if (!previous) return;
    before.current = null;
    for (const [id, node] of nodes.current) {
      const from = previous.get(id);
      const to = node.getBoundingClientRect();
      if (!from) {
        node.animate(
          [
            { opacity: 0, transform: "scale(0.94)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 260, easing: EASING },
        );
        continue;
      }
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 320, easing: EASING },
      );
    }
  }, [orders, showDone]);

  const setDragState = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const targetAt = (x: number, y: number): OrderStatus | null => {
    const element = document.elementFromPoint(x, y);
    const column = element?.closest<HTMLElement>("[data-board-status]");
    return (column?.dataset.boardStatus as OrderStatus | undefined) ?? null;
  };

  const startDrag = (state: Pending, x: number, y: number) => {
    state.armed = true;
    navigator.vibrate?.(10);
    setDragState({
      order: state.order,
      x,
      y,
      offsetX: state.startX - state.rect.left,
      offsetY: state.startY - state.rect.top,
      width: state.rect.width,
      target: state.order.status,
    });
  };

  const move = (order: BoardOrder, status: OrderStatus, dropRect: DOMRect | null) => {
    const previous = orders;
    const previousDone = doneTotal;
    snapshot(dropRect ? new Map([[order.id, dropRect]]) : undefined);
    setOrders((current) =>
      current.map((entry) => (entry.id === order.id ? { ...entry, status } : entry)).sort(byNewest),
    );
    if (status === "done") {
      setDoneTotal((count) => count + 1);
      setDoneFlash((count) => count + 1);
    } else if (order.status === "done") {
      setDoneTotal((count) => Math.max(0, count - 1));
    }
    setError("");
    startTransition(async () => {
      const result = await setOrderStatusAction(order.id, status);
      if (!result.ok) {
        snapshot();
        setOrders(previous);
        setDoneTotal(previousDone);
        setError(`Заказ №${order.id}: ${result.problems.join("; ")}`);
        return;
      }
      if (status === "ready" && !order.readySmsSent) {
        setSmsProblem("");
        setSmsOrder(order);
      } else if (smsOrder?.id === order.id) {
        setSmsOrder(null);
      }
      router.refresh();
    });
  };

  const finish = (x: number, y: number) => {
    const current = dragRef.current;
    if (!current) return;
    const status = targetAt(x, y) ?? current.target;
    const dropRect = ghost.current?.getBoundingClientRect() ?? null;
    const left = current.x - current.offsetX;
    const top = current.y - current.offsetY;
    const lifted = `translate(${left}px, ${top}px) rotate(2deg) scale(1.03)`;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);

    if (!status || status === current.order.status) {
      const home = nodes.current.get(current.order.id);
      if (home && ghost.current) {
        const to = home.getBoundingClientRect();
        const animation = ghost.current.animate(
          [{ transform: lifted }, { transform: `translate(${to.left}px, ${to.top}px)` }],
          { duration: 220, easing: EASING, fill: "forwards" },
        );
        animation.onfinish = () => setDragState(null);
        dragRef.current = null;
        return;
      }
      setDragState(null);
      return;
    }

    if (status === "done" && !showDone && ghost.current && doneZone.current) {
      const zone = doneZone.current.getBoundingClientRect();
      const height = ghost.current.offsetHeight;
      const toLeft = zone.left + zone.width / 2 - current.width / 2;
      const toTop = zone.top + zone.height / 2 - height / 2;
      const animation = ghost.current.animate(
        [
          { transform: lifted, opacity: 1 },
          { transform: `translate(${toLeft}px, ${toTop}px) scale(0.2)`, opacity: 0 },
        ],
        { duration: 340, easing: EASING, fill: "forwards" },
      );
      dragRef.current = null;
      animation.onfinish = () => setDragState(null);
      move(current.order, status, null);
      return;
    }

    setDragState(null);
    move(current.order, status, dropRect);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = pending.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);

      if (!state.armed) {
        if (state.touch) {
          if (distance > DRAG_THRESHOLD) {
            if (state.timer) window.clearTimeout(state.timer);
            pending.current = null;
          }
          return;
        }
        if (distance < DRAG_THRESHOLD) return;
        startDrag(state, event.clientX, event.clientY);
      }

      const current = dragRef.current;
      if (!current) return;
      const box = scroller.current?.getBoundingClientRect();
      if (box && scroller.current) {
        if (event.clientX < box.left + EDGE_SCROLL) scroller.current.scrollLeft -= 14;
        else if (event.clientX > box.right - EDGE_SCROLL) scroller.current.scrollLeft += 14;
      }
      setDragState({
        ...current,
        x: event.clientX,
        y: event.clientY,
        target: targetAt(event.clientX, event.clientY),
      });
    };

    const onUp = (event: PointerEvent) => {
      const state = pending.current;
      if (!state || event.pointerId !== state.pointerId) return;
      if (state.timer) window.clearTimeout(state.timer);
      pending.current = null;
      if (state.armed) finish(event.clientX, event.clientY);
    };

    const onCancel = (event: PointerEvent) => {
      const state = pending.current;
      if (!state || event.pointerId !== state.pointerId) return;
      if (state.timer) window.clearTimeout(state.timer);
      pending.current = null;
      if (state.armed) setDragState(null);
    };

    const blockScroll = (event: TouchEvent) => {
      if (pending.current?.armed) event.preventDefault();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", blockScroll);
    };
  });

  const onCardPointerDown = (order: BoardOrder, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || pending.current) return;
    const touch = event.pointerType !== "mouse";
    const state: Pending = {
      order,
      pointerId: event.pointerId,
      touch,
      startX: event.clientX,
      startY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
      timer: null,
      armed: false,
    };
    if (touch) {
      state.timer = window.setTimeout(() => {
        if (pending.current === state) startDrag(state, state.startX, state.startY);
      }, TOUCH_HOLD_MS);
    }
    pending.current = state;
  };

  const card = (order: BoardOrder) => {
    const dragging = drag?.order.id === order.id;
    return (
      <Link
        key={order.id}
        ref={(node) => {
          if (node) nodes.current.set(order.id, node);
          else nodes.current.delete(order.id);
        }}
        href={`/admin/orders/${order.id}/`}
        prefetch={false}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => onCardPointerDown(order, event)}
        onClickCapture={(event) => {
          if (suppressClick.current) event.preventDefault();
        }}
        onContextMenu={(event) => {
          if (pending.current?.touch) event.preventDefault();
        }}
        className={`block cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] rounded-xl border border-brand-100 bg-white p-3 shadow-sm transition-[opacity,box-shadow] hover:shadow-md active:cursor-grabbing ${
          dragging ? "opacity-30" : ""
        }`}
      >
        <BoardCardBody order={order} currencySymbol={currencySymbol} />
      </Link>
    );
  };

  const sendReadySms = async (order: BoardOrder) => {
    setSmsSending(true);
    setSmsProblem("");
    try {
      const result = await notifyOrderReadyAction(order.id);
      if (!result.ok) {
        setSmsProblem(result.problems.join("; "));
        return;
      }
      setOrders((current) =>
        current.map((entry) => (entry.id === order.id ? { ...entry, readySmsSent: true } : entry)),
      );
      setSmsOrder(null);
    } finally {
      setSmsSending(false);
    }
  };

  const doneOrders = orders.filter((order) => order.status === "done");

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-card border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div ref={scroller} className="-mx-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-stretch gap-3">
          {COLUMNS.map((column) => {
            const items = orders.filter((order) => order.status === column.id);
            const over = drag?.target === column.id && drag.order.status !== column.id;
            return (
              <section
                key={column.id}
                data-board-status={column.id}
                aria-label={column.name}
                className={`flex w-72 shrink-0 flex-col rounded-card border p-2 transition-colors duration-200 ${
                  over ? "border-brand-400 bg-brand-100" : "border-transparent bg-brand-50"
                }`}
              >
                <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                  <span className={`badge order-status order-status-${column.id}`}>{column.name}</span>
                  <span className="tnum text-xs text-brand-400">{items.length}</span>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2">
                  {items.map(card)}
                  {items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-brand-200 px-3 py-6 text-center text-xs text-brand-300">
                      Пусто
                    </p>
                  )}
                </div>
              </section>
            );
          })}

          <section
            ref={doneZone}
            data-board-status="done"
            aria-label="Выполнен"
            className={`relative flex w-56 shrink-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-card border-2 border-dashed p-4 text-center transition-all duration-300 ${
              drag && drag.target === "done" && drag.order.status !== "done"
                ? "scale-[1.02] border-green-600 bg-green-50"
                : drag
                  ? "border-brand-300 bg-brand-50"
                  : "border-brand-200 bg-transparent"
            }`}
          >
            <span
              key={doneFlash}
              className={`flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white ${
                doneFlash ? "animate-[board-done-pop_420ms_ease-out]" : ""
              }`}
            >
              <CheckIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-brand-900">Выполнен</span>
            <span className="text-xs text-brand-400">Перетащите сюда — заказ закроется и скроется с доски</span>
            <button
              type="button"
              onClick={() => {
                snapshot();
                setShowDone((value) => !value);
              }}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              {showDone ? "Скрыть выполненные" : "Показать выполненные"}{" "}
              <span className="tnum opacity-70">{doneTotal}</span>
            </button>
          </section>
        </div>
      </div>

      {showDone && (
        <section data-board-status="done" className="card p-3" aria-label="Выполненные заказы">
          <h2 className="mb-2 px-1 text-sm font-semibold text-brand-900">
            Выполненные <span className="tnum font-normal text-brand-400">{doneTotal}</span>
          </h2>
          {doneOrders.length === 0 ? (
            <p className="px-1 py-4 text-sm text-brand-400">Выполненных заказов нет.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{doneOrders.map(card)}</div>
          )}
          {doneTotal > doneOrders.length && (
            <p className="mt-2 px-1 text-xs text-brand-400">
              Показаны последние {doneOrders.length}. Все — в списке, вкладка «{STATUS_NAMES.done}».
            </p>
          )}
        </section>
      )}

      {smsOrder && (
        <div
          role="dialog"
          aria-label="SMS о готовности"
          className="fixed inset-x-3 bottom-20 z-[90] mx-auto max-w-md animate-[board-toast-in_260ms_cubic-bezier(0.2,0.8,0.2,1)] rounded-card border border-brand-200 bg-white p-4 shadow-2xl lg:bottom-6"
        >
          <p className="text-sm font-medium text-brand-900">
            Заказ №{smsOrder.id} готов к выдаче. Отправить {smsOrder.name ? `${smsOrder.name} ` : ""}SMS о готовности?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sendReadySms(smsOrder)}
              disabled={smsSending || !smsReady}
              className="btn-primary py-1.5 text-sm"
            >
              {smsSending ? (
                <>
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Отправляем…
                </>
              ) : (
                "Да, отправить"
              )}
            </button>
            <button
              type="button"
              onClick={() => setSmsOrder(null)}
              disabled={smsSending}
              className="btn-ghost py-1.5 text-sm"
            >
              Нет
            </button>
          </div>
          {smsProblem && <p className="mt-2 text-xs text-red-700">{smsProblem}</p>}
          {!smsReady && (
            <p className="mt-2 text-xs text-brand-500">SMS не настроены — подключите sms.by в разделе Настройки → SMS.</p>
          )}
        </div>
      )}

      {drag && (
        <div
          ref={ghost}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-[100] rounded-xl border border-brand-200 bg-white p-3 shadow-2xl"
          style={{
            width: drag.width,
            transform: `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px) rotate(2deg) scale(1.03)`,
          }}
        >
          <BoardCardBody order={drag.order} currencySymbol={currencySymbol} />
        </div>
      )}
    </div>
  );
}

function BoardCardBody({ order, currencySymbol }: { order: BoardOrder; currencySymbol: string }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="tnum text-xs text-brand-400">№{order.id}</span>
        <span className="tnum text-sm font-semibold text-brand-900">
          {formatPrice(order.total, currencySymbol)}
        </span>
      </div>
      <p className="mt-1 truncate text-sm font-medium text-brand-900">{order.name || "Без имени"}</p>
      <p className="tnum truncate text-xs text-brand-500">{order.phone}</p>
      <p className="mt-1 truncate text-xs text-brand-400">
        {formatDate(order.createdAt)} · {order.itemsCount} поз. · {order.deliveryName || "доставка не указана"}
      </p>
      {(order.needsCheck || order.notSent) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {order.needsCheck && <span className="badge order-status order-status-new">проверить</span>}
          {order.notSent && <span className="badge bg-brand-100 text-brand-500">не отправлен</span>}
        </div>
      )}
    </>
  );
}
