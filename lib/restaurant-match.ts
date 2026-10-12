export function normalizedRestaurantName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s·•.．()（）_—-]+/g, "");
}

export function restaurantNameSimilarity(input: string, candidate: string): number {
  const left = normalizedRestaurantName(input);
  const right = normalizedRestaurantName(candidate);
  if (left.length < 2 || right.length < 2) return 0;
  if (left === right) return 1;
  if (left.length === 2 && !right.startsWith(left)) return 0;
  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (left.includes(right) || right.includes(left)) return 0.7 + 0.2 * shorter / longer;

  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index++) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let shared = 0;
  for (let index = 0; index < right.length - 1; index++) {
    const pair = right.slice(index, index + 2);
    const remaining = pairs.get(pair) ?? 0;
    if (remaining > 0) { shared++; pairs.set(pair, remaining - 1); }
  }
  const similarity = 2 * shared / (left.length + right.length - 2);
  return similarity >= 0.55 ? similarity : 0;
}
