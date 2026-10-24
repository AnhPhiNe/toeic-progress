const quantity = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** Presentation only: measured study time keeps its original precision in storage and goal calculations. */
export function formatPlanQuantity(value: number): string {
  if (value > 0 && value < 0.1) return '<0,1';
  return quantity.format(value);
}
