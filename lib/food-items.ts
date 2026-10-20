export function splitFoodItems(food: string): string[] {
  return [...new Set(food.split(/[,，;；、\n\r]+/u).map((item) => item.trim()).filter(Boolean))];
}

export function selectedFoodsForOrder(food: string, candidate: unknown): string[] | null | undefined {
  if (candidate === undefined || candidate === null) return null;
  if (!Array.isArray(candidate) || candidate.length > 40 || candidate.some((item) => typeof item !== "string")) return undefined;
  const choices = splitFoodItems(food);
  const selected = [...new Set(candidate as string[])];
  return selected.length > 0 && selected.every((item) => choices.includes(item)) ? selected : undefined;
}
