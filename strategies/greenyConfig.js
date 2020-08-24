exports.greeny = {
  // stage 1 'Price under ema by atleast <crossedEmaThreshold>%'
  crossedEmaThreshold: 0.05,
  // stage 2 'Price RSI < <rsiThreshold>'
  rsiThreshold: 35,
  // stage 3 'MACD less than <minimumMACDLevel>'
  minimumMACDLevel: 0,
  // stage 4 'MACD closing' - takes <macdPriceLookupPeriod> period(s) and then uses <divergenceDistance> to
  // calulate whether or not MACD is closing
  // <macdConvergenceThreshold> the minimum distance between max histogram value and current histogram value
  macdConvergenceThreshold: 0.99,
  // <macdSignalCrossedThreshold> how far away from signal line can macd be before considering it a good buy
  macdSignalCrossedThreshold: 1.05,
  // <macdPriceLookupPeriod> the amount of periods to find a max macd to get a V shape close
  macdPriceLookupPeriod: 3,
  // <divergenceDistance> the location to look for a max macd within the lookup period
  divergenceDistance: (macdPriceLookupPeriod) => { return Math.floor(macdPriceLookupPeriod / 2) },
  // P/L settings
  stopLossPercentage: 0.05,
  // 1 = 100% of money to use per trade
  percentageToUsePerTrade: 1,
  buyCondition: ({mostRecentPriceData, emaTarget, alreadyTouchedRSIThreshold, config, macdSlice, mostRecentTime}) => {
    if (mostRecentPriceData.price < emaTarget) {
      if (alreadyTouchedRSIThreshold) {
        console.log('Bounced off RSI threshold already')
        if (mostRecentPriceData.macd.histogram < config.minimumMACDLevel) {
          let prevVal = Infinity
          for (const val of macdSlice) {
            if (val.macd.histogram < prevVal) {
              prevVal = val.macd.histogram
            }
          }
          // furthest divergence should be middle number of MACDS BELOW 0 so always negative hence >
          let divergence = config.divergenceDistance(config.macdPriceLookupPeriod)

          if (macdSlice[divergence].macd.histogram === prevVal ) {
            console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
            console.log(mostRecentTime)
            console.log('MACD CLOSING')
            console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
            if (mostRecentPriceData.macd.histogram > (macdSlice[divergence].macd.histogram * config.macdConvergenceThreshold)) {
              console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
              console.log(mostRecentTime)
              console.log('MACD macd: ' +mostRecentPriceData.macd.MACD)
              console.log('MACD histo: ' + mostRecentPriceData.macd.histogram)
              console.log('MACD signal: ' +mostRecentPriceData.macd.signal)
              console.log('histo threshold: ' +(macdSlice[divergence].macd.histogram * config.macdConvergenceThreshold))
              console.log('signal threshold: ' +(mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold))
              console.log(mostRecentPriceData.macd.MACD + ' > ' + (mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold))
              console.log(mostRecentPriceData.macd.MACD >= (mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold))
              console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
              if (mostRecentPriceData.macd.MACD >= (mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold)) {
                console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ BUY @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
                return { signal: true, alreadyTouchedRSIThreshold: false }
              } else {
                return { signal: false, alreadyTouchedRSIThreshold: true }
              }
            } else {
              return { signal: false, alreadyTouchedRSIThreshold: true }
            }
          } else {
            return { signal: false, alreadyTouchedRSIThreshold: true }
          }
        } else {
          return { signal: false, alreadyTouchedRSIThreshold: true }
        }
      } else {
        if (mostRecentPriceData.rsi <= config.rsiThreshold) {
          console.log('Touched RSI threshold')
          return { signal: false, alreadyTouchedRSIThreshold: true }
        } else {
          return { signal: false, alreadyTouchedRSIThreshold: false }
        }
      }
    } else {
      return { signal: false, alreadyTouchedRSIThreshold: false }
    }
  },
  takeProfitCondition: (currentPrice, ema50, ema20, alreadyCrossedEma50) => {
    // return currentPrice >= ema50 ? { signal: true } : { signal: false }
    if (alreadyCrossedEma50) {
      // Crossed EMA 50
      if (currentPrice <= ema50) {
        // Sell if it crosses back down before crossing ema20
        return { signal: true, alreadyCrossedEma50: false }
      }
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
