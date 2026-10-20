export const tagColors = [
  "#f5c542", "#242b28", "#d8f277", "#ff9b73",
  "#f3a6c8", "#9fc8ff", "#bba4ee", "#8ed4c2",
  "#e45454", "#335c9e", "#6a4c93", "#23816b",
] as const;

export const defaultTagColor = tagColors[2];

export function tagTextColor(color: string): string {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#17221d" : "#ffffff";
}

export function tagStyle(color: string) {
  return { backgroundColor: color, color: tagTextColor(color), borderColor: color };
}
