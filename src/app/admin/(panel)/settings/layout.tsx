import { SettingsShell } from "@/components/admin/SettingsShell";
import { isLiteMode } from "@/lib/lite-mode";

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SettingsShell lite={isLiteMode()}>{children}</SettingsShell>;
}
