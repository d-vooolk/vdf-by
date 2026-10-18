import { SettingsShell } from "@/components/admin/SettingsShell";

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SettingsShell>{children}</SettingsShell>;
}
