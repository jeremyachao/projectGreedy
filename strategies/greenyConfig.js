exports.greeny = {
  // stage 1 'Price under ema by atleast <crossedEmaThreshold>%'
  crossedEmaThreshold: 0.05,
  // stage 2 'Price RSI < <rsiThreshold>'
  rsiThreshold: 50,
  // stage 3 'MACD less than <minimumMACDLevel>'
  minimumMACDLevel: 0,
  // stage 4 'MACD closing' - takes <macdPriceLookupPeriod> period(s) and then uses <divergenceDistance> to
  // calulate whether or not MACD is closing
  macdPriceLookupPeriod: 3,
  divergenceDistance: (macdPriceLookupPeriod) => { return Math.floor(macdPriceLookupPeriod / 2) },
  // P/L settings
  stopLossPercentage: 0.05,
  // 1 = 100% of money to use per trade
  percentageToUsePerTrade: 1,
  takeProfitCondition: (currentPrice, ema50, ema20, alreadyCrossedEma50) => {
    // return currentPrice >= ema50 ? { signal: true } : { signal: false }
    if (alreadyCrossedEma50) {
      // Crossed EMA 50
      if (ema20 >= ema50) {
        if (currentPrice <= ema20) {
          return { signal: true, alreadyCrossedEma50: false }
        } else {
          return { signal: false, alreadyCrossedEma50: true }
        }
      } else {
        return { signal: false, alreadyCrossedEma50: true }
      }
    } else {
      // Not yet crossed EMA 50
      if (currentPrice >= ema50) {
        // Just crossed EMA 50
        return { signal: false , alreadyCrossedEma50: true }
      } else {
        return { signal: false, alreadyCrossedEma50: false }
      }
    }
  },
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
*/
