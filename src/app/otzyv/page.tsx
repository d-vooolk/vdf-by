import type { Metadata } from "next";
import Link from "next/link";

import { getSite } from "@/lib/catalog";
import { REVIEW_LINKS } from "@/lib/review-links";

import styles from "./otzyv.module.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Оставьте отзыв",
  robots: { index: false, follow: false },
};

const IDEAS = ["Качество товара", "Как светит после установки", "Скорость доставки", "Консультация"];

function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill="currentColor"
      />
    </svg>
  );
}

function YandexIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="#FC3F1D" />
      <path
        d="M26.9 37h4.6V11h-6.7c-6.8 0-10.3 3.5-10.3 8.6 0 4.1 1.9 6.5 5.4 9L13.8 37h5l6.4-9.6-2.2-1.5c-2.7-1.8-4-3.2-4-6.3 0-2.7 1.9-4.6 5.6-4.6h2.3V37z"
        fill="#fff"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Platform({
  href,
  icon,
  iconClass,
  name,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  iconClass?: string;
  name: string;
  hint: string;
}) {
  return (
    <a className={styles.platform} href={href} target="_blank" rel="noopener">
      <span className={`${styles.icon} ${iconClass ?? ""}`}>{icon}</span>
      <span className={styles.body}>
        <span className={styles.name}>{name}</span>
        <span className={styles.hint}>{hint}</span>
      </span>
      <span className={styles.go}>
        <ArrowIcon />
      </span>
    </a>
  );
}

export default function ReviewPage() {
  const site = getSite();

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link className={styles.logo} href="/" aria-label={`${site.name} — на главную`}>
          <img src="/brand/logo.png" alt={site.name} width={600} height={100} />
        </Link>

        <section className={styles.hero}>
          <div className={styles.stars} role="img" aria-label="5 звёзд">
            <Star />
            <Star />
            <Star />
            <Star />
            <Star />
          </div>
          <h1 className={styles.title}>
            Спасибо, что выбрали <span>{site.name}</span>!
          </h1>
          <p className={styles.text}>
            Нам очень важно ваше мнение. Отзыв помогает другим водителям выбрать свет для своей
            машины, а нам — становиться лучше. Это займёт меньше минуты.
          </p>
          <div className={styles.rating}>
            <span>Наш рейтинг на Яндексе</span>
            <iframe
              src={REVIEW_LINKS.yandexRatingBadge}
              width={150}
              height={50}
              title={`Рейтинг ${site.name} на Яндекс Картах`}
              loading="lazy"
            />
          </div>
        </section>

        <div className={styles.list}>
          <Platform
            href={REVIEW_LINKS.yandex}
            icon={<YandexIcon />}
            iconClass={styles.iconYandex}
            name="Яндекс Карты"
            hint="Оставить отзыв на Яндексе"
          />
          <Platform
            href={REVIEW_LINKS.google}
            icon={<GoogleIcon />}
            name="Google Карты"
            hint="Оставить отзыв в Google"
          />
        </div>

        <div className={styles.ideas}>
          <p>О чём можно рассказать</p>
          <div className={styles.chips}>
            {IDEAS.map((idea) => (
              <span key={idea}>{idea}</span>
            ))}
          </div>
        </div>

        <footer className={styles.foot}>
          <img src="/brand/logo.png" alt="" width={600} height={100} />
          <a href={`tel:${site.phoneHref}`}>{site.phone}</a>
        </footer>
      </div>
    </div>
  );
}
