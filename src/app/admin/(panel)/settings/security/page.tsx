import { AidProtocol } from "@/components/admin/AidProtocol";
import { panicConfigured } from "@/lib/panic";

export const metadata = { title: "Протокол AID" };

export const dynamic = "force-dynamic";

export default function SecurityPage() {
  return <AidProtocol configured={panicConfigured()} />;
}
