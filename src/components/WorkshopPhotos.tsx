import { Picture } from "@/components/Picture";
import type { ShownWorkshopPhotos } from "@/lib/workshop-photos";

export function WorkshopPhotos({ set, className = "" }: { set: ShownWorkshopPhotos | null; className?: string }) {
  if (!set) return null;
  return (
    <section className={className}>
      <h2 className="mb-2 text-xl font-semibold text-brand-900 sm:text-2xl">{set.title}</h2>
      <p className="mb-5 max-w-3xl text-sm text-brand-600">
        {set.lead}{" "}
        <a
          href={set.link.href}
          target="_blank"
          rel="noopener"
          className="font-medium text-brand-900 underline hover:text-brand-600"
        >
          {set.link.anchor}
        </a>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {set.photos.map((photo) => (
          <figure key={photo.image} className="overflow-hidden rounded-card border border-brand-100">
            <Picture
              entry={photo.entry}
              alt={photo.caption}
              sizes="(min-width: 1024px) 360px, 50vw"
              className="aspect-[4/3] h-auto w-full bg-brand-50 object-contain"
            />
            <figcaption className="px-3 py-2 text-xs text-brand-600 sm:text-sm">{photo.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
