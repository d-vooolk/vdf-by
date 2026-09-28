export function specsFromText(text: string): Array<{ name: string; value: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf(":");
      return at > 0 ? { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() } : null;
    })
    .filter((spec): spec is { name: string; value: string } => Boolean(spec?.name && spec.value));
}

export function specsToText(specs: Array<{ name: string; value: string }>): string {
  return specs.map((spec) => `${spec.name}: ${spec.value}`).join("\n");
}
