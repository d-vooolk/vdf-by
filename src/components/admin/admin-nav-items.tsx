import {
  CarIcon,
  CartIcon,
  ChartIcon,
  DocumentIcon,
  FolderIcon,
  GearIcon,
  HeadlightIcon,
  HomeIcon,
  ImagePlusIcon,
  ListIcon,
  PackageIcon,
  PhotoIcon,
  SearchIcon,
  SparkIcon,
  TrashIcon,
  UploadIcon,
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
  badge?: "orders" | "customers" | "service";
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

export const NAV: Array<NavLink | NavGroup> = [
  {
    label: "Сводка",
    links: [
      { href: "/admin/", label: "Общая", exact: true, icon: HomeIcon },
      { href: "/admin/traffic/", label: "Посещаемость", icon: ChartIcon },
      { href: "/admin/seo/", label: "SEO", icon: SearchIcon },
    ],
  },
  {
    label: "Товары",
    links: [
      { href: "/admin/products/", label: "Все товары", icon: PackageIcon },
      { href: "/admin/categories/", label: "Категории", icon: FolderIcon },
      { href: "/admin/incomplete/", label: "Незаполненные", icon: ListIcon },
      { href: "/admin/out-of-stock/", label: "Нет в наличии", icon: AlertIcon },
      { href: "/admin/frame-types/", label: "Типы рамок", icon: HeadlightIcon },
    ],
  },
  { href: "/admin/orders/", label: "Заказы", badge: "orders", icon: CartIcon },
  { href: "/admin/service-requests/", label: "Установка", badge: "service", icon: WrenchIcon },
  { href: "/admin/customers/", label: "Покупатели", badge: "customers", icon: UserIcon },
  { href: "/admin/accounting/", label: "Бухгалтерия", icon: WalletIcon },
  { href: "/admin/articles/", label: "Статьи", icon: DocumentIcon },
  {
    label: "Импорт",
    links: [
      { href: "/admin/vdf-catalog/", label: "Каталог VDF", icon: UploadIcon },
      { href: "/admin/vdf-prices/", label: "Курсы и цены", icon: ChartIcon },
    ],
  },
  {
    label: "Справочник",
    links: [
      { href: "/admin/cars/", label: "Автомобили", icon: CarIcon },
      { href: "/admin/media/", label: "Фото", icon: PhotoIcon },
      { href: "/admin/unused-photos/", label: "Неиспользуемые фото", icon: TrashIcon },
      { href: "/admin/ai/", label: "Нейросеть для текста", icon: SparkIcon },
      { href: "/admin/composer/", label: "Генератор картинок", icon: ImagePlusIcon },
    ],
  },
  { href: "/admin/settings/", label: "Настройки", icon: GearIcon },
];

export const isGroup = (item: NavLink | NavGroup): item is NavGroup => "links" in item;

export const NAV_LINKS: NavLink[] = NAV.flatMap((item) => (isGroup(item) ? item.links : [item]));

export function bottomNavLinks(chosen: string[] | null): NavLink[] {
  const wanted = chosen?.length ? chosen : DEFAULT_BOTTOM_NAV;
  const picked = NAV_LINKS.filter((link) => wanted.includes(link.href));
  const links = picked.length
    ? picked
    : NAV_LINKS.filter((link) => DEFAULT_BOTTOM_NAV.includes(link.href));
  return links.slice(0, BOTTOM_NAV_MAX);
}
