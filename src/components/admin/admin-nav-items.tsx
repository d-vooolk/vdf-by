import {
  CarIcon,
  CartIcon,
  ChartIcon,
  ClockIcon,
  DocumentIcon,
  DownloadIcon,
  FolderIcon,
  GearIcon,
  GridIcon,
  HeadlightIcon,
  HomeIcon,
  ImagePlusIcon,
  ListIcon,
  PackageIcon,
  SparkIcon,
  SparkleListIcon,
  TrashIcon,
  UserIcon,
  WalletIcon,
  WrenchIcon,
  AlertIcon,
} from "@/components/icons";
import { BOTTOM_NAV_MAX, DEFAULT_BOTTOM_NAV } from "@/lib/admin-prefs";

export interface NavLink {
  href: string;
  label: string;
  exact?: boolean;
  also?: string[];
  badge?: "orders" | "customers" | "service" | "waitlist";
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
  icon?: NavLink["icon"];
}

export const NAV: Array<NavLink | NavGroup> = [
  { href: "/admin/", label: "Сводка", exact: true, also: ["/admin/traffic/", "/admin/seo/"], icon: HomeIcon },
  {
    label: "Товары",
    icon: GridIcon,
    links: [
      { href: "/admin/products/", label: "Все товары", icon: PackageIcon },
      { href: "/admin/categories/", label: "Категории", icon: FolderIcon },
      { href: "/admin/incomplete/", label: "Незаполненные", icon: ListIcon },
      { href: "/admin/out-of-stock/", label: "Нет в наличии", icon: AlertIcon },
      { href: "/admin/frame-types/", label: "Типы рамок", icon: HeadlightIcon },
    ],
  },
  { href: "/admin/orders/", label: "Заказы", badge: "orders", icon: CartIcon },
  { href: "/admin/accounting/", label: "Бухгалтерия", icon: WalletIcon },
  { href: "/admin/service-requests/", label: "Установка", badge: "service", icon: WrenchIcon },
  { href: "/admin/customers/", label: "Покупатели", badge: "customers", icon: UserIcon },
  { href: "/admin/waitlist/", label: "Лист ожидания", badge: "waitlist", icon: ClockIcon },
  { href: "/admin/articles/", label: "Статьи", icon: DocumentIcon },
  {
    label: "Импорт",
    icon: DownloadIcon,
    links: [
      { href: "/admin/vdf-prices/", label: "Курсы и цены", icon: ChartIcon },
    ],
  },
  {
    label: "Справочник",
    icon: SparkleListIcon,
    links: [
      { href: "/admin/cars/", label: "Автомобили", icon: CarIcon },
      { href: "/admin/unused-photos/", label: "Неиспользуемые фото", icon: TrashIcon },
      { href: "/admin/ai/", label: "Нейросеть для текста", icon: SparkIcon },
      { href: "/admin/composer/", label: "Генератор картинок", icon: ImagePlusIcon },
    ],
  },
  { href: "/admin/settings/", label: "Настройки", icon: GearIcon },
];

export const isGroup = (item: NavLink | NavGroup): item is NavGroup => "links" in item;

export const NAV_LINKS: NavLink[] = NAV.flatMap((item) => (isGroup(item) ? item.links : [item]));

const MOBILE_SECTIONS: Array<{ label: string; hrefs: string[] }> = [
  { label: "Главное", hrefs: ["/admin/"] },
  { label: "Продажи", hrefs: ["/admin/orders/", "/admin/accounting/", "/admin/service-requests/", "/admin/customers/", "/admin/waitlist/"] },
  {
    label: "Товары",
    hrefs: ["/admin/products/", "/admin/categories/", "/admin/frame-types/", "/admin/incomplete/", "/admin/out-of-stock/"],
  },
  { label: "Контент", hrefs: ["/admin/articles/", "/admin/composer/", "/admin/ai/"] },
  { label: "Справочник", hrefs: ["/admin/cars/", "/admin/vdf-prices/", "/admin/unused-photos/"] },
  { label: "Система", hrefs: ["/admin/settings/"] },
];

function mobileLink(href: string): NavLink[] {
  const link = NAV_LINKS.find((item) => item.href === href);
  return link ? [link] : [];
}

export const MOBILE_GROUPS: NavGroup[] = MOBILE_SECTIONS.map((section) => ({
  label: section.label,
  links: section.hrefs.flatMap(mobileLink),
}));

export const MOBILE_LINKS: NavLink[] = MOBILE_GROUPS.flatMap((group) => group.links);

export function bottomNavLinks(chosen: string[] | null): NavLink[] {
  const wanted = chosen?.length ? chosen : DEFAULT_BOTTOM_NAV;
  const picked = MOBILE_LINKS.filter((link) => wanted.includes(link.href));
  const links = picked.length
    ? picked
    : MOBILE_LINKS.filter((link) => DEFAULT_BOTTOM_NAV.includes(link.href));
  return links.slice(0, BOTTOM_NAV_MAX);
}
