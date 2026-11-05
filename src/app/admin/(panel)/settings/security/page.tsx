import { AidProtocol } from "@/components/admin/AidProtocol";
import { hiddenInLiteMode } from "@/lib/lite-mode";
import { panicConfigured } from "@/lib/panic";

export const metadata = { title: "Протокол AID" };

export const dynamic = "force-dynamic";

export default function SecurityPage() {
  hiddenInLiteMode();
  return <AidProtocol configured={panicConfigured()} />;
}
