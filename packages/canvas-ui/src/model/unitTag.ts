/** A unit's tag (P-227, B-101) when its name carries one; undefined otherwise. */
export function unitTag(name: string): string | undefined {
  return name.match(/\b[A-Z]{1,3}-\d{2,4}\b/)?.[0];
}
