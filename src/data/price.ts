export function idxPriceTick(price: number) {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2_000) return 5;
  if (price < 5_000) return 10;
  return 25;
}

export function nearestTradablePrice(prediction: number, referencePrice: number) {
  const tick = idxPriceTick(referencePrice);
  return Math.round(prediction / tick) * tick;
}
