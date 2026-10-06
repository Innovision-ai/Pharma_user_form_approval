type ClassValue = string | number | boolean | null | undefined | ClassValue[];

function flatten(input: ClassValue, out: string[]): void {
  if (!input) return;
  if (Array.isArray(input)) {
    for (const item of input) flatten(item, out);
    return;
  }
  out.push(String(input));
}

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  flatten(inputs, out);
  return out.join(" ");
}
