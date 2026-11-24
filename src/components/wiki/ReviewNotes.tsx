import type { ReviewNote } from "./types";

function when(at: string): string {
  return new Date(at).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewNotes({ notes }: { notes: ReviewNote[] }) {
  if (!notes.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((note, index) => (
        <div key={index} className="rounded-control border-l-4 border-amber-400 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">
            {index === notes.length - 1 ? "Что исправить" : "Прошлое замечание"} · {note.byName} · {when(note.at)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-brand-900">{note.text}</p>
        </div>
      ))}
    </div>
  );
}
