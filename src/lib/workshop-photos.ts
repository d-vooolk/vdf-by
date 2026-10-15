import { getDb } from "./db";
import { getImage } from "./images";
import type { ImageEntry } from "./image-types";
import { WORKSHOP_LINKS, type WorkshopLink } from "./workshop-links";

const SETTINGS_KEY = "workshop_photos";

interface WorkshopPhoto {
  image: string;
  caption: string;
}

interface WorkshopPhotoSet {
  title: string;
  lead: string;
  photos: WorkshopPhoto[];
}

export interface ShownWorkshopPhotos {
  title: string;
  lead: string;
  link: WorkshopLink;
  photos: Array<WorkshopPhoto & { entry: ImageEntry }>;
}

type WorkshopKind = keyof typeof WORKSHOP_LINKS;

function readSets(): Partial<Record<WorkshopKind, WorkshopPhotoSet>> {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

export function workshopPhotosFor(link: WorkshopLink | null): ShownWorkshopPhotos | null {
  if (!link) return null;
  const kind = (Object.keys(WORKSHOP_LINKS) as WorkshopKind[]).find(
    (key) => WORKSHOP_LINKS[key].href === link.href,
  );
  const set = kind ? readSets()[kind] : undefined;
  if (!set) return null;
  const photos = set.photos.flatMap((photo) => {
    const entry = getImage(photo.image);
    return entry ? [{ ...photo, entry }] : [];
  });
  return photos.length ? { title: set.title, lead: set.lead, link, photos } : null;
}
