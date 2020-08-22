exports.greeny = {
  // stage 1 'Price under ema by atleast <crossedEmaThreshold>%'
  crossedEmaThreshold: 0.05,
  // stage 2 'Price RSI < <rsiThreshold>'
  rsiThreshold: 35,
  // stage 3 'MACD less than <minimumMACDLevel>'
  minimumMACDLevel: 0,
  // stage 4 'MACD closing' - takes <macdPriceLookupPeriod> period(s) and then uses <divergenceDistance> to
  // calulate whether or not MACD is closing
  macdPriceLookupPeriod: 3,
  divergenceDistance: (macdPriceLookupPeriod) => { return Math.floor(macdPriceLookupPeriod / 2) },
  // P/L settings
  takeProfitCondition: (currentPrice, threshold) => { return currentPrice >= threshold },
  stopLossPercentage: 0.03,
}

// example low risk score settings

/*
crossedEmaThreshold: 0.05,
rsiThreshold: 35,
minimumMACDLevel: 0,
macdPriceLookupPeriod: 3,
divergenceDistance: (macdPriceLookupPeriod) => { return Math.floor(macdPriceLookupPeriod / 2) },
takeProfitCondition: (currentPrice, threshold) => { return currentPrice >= threshold },
stopLossPercentage: 0.03,
*.
