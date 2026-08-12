export function formatValue(value: number | null | undefined, format: "percent" | "currency" | "number" | string) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  if (format === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }

  if (format === "currency") {
    return Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  return Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatPValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}

export function formatCount(value: number) {
  return Intl.NumberFormat("en-US").format(value);
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
