const greenyLogs = require('./greenyLogs')
exports.greeny = {
  // indicators and tools settings
  ema1: 20,
  ema2: 50,
  ema3: 200,
  rsi: 14,
  macd: {
    fast: 12,
    slow: 26,
    signalLength: 9,
  },
  // stage 1 'Price under ema by atleast <crossedEmaThreshold>%'
  crossedEmaThreshold: 0.99995,
  // <emaModifier> used to counteract minor calculation error of ema
  emaModifier: 0.999, // 0.9998
  // <ema50SLThreshold> acts as a trailing stop loss
  ema50SLThreshold: 0.999,
  // <ema20Above50Modifier> how much over ema20 should be over ema50 before TP
  ema20Above50Modifier: 0.9995,
  // <ema20TPModifier> how much above ema20 to tp
  ema20TPModifier: 1,
  // stage 2 'Price RSI < <rsiThreshold>'
  rsiThreshold: 35,
  // <rsiBuyInThreshold> only buys in if rsi is lower than this
  rsiBuyInThreshold: 50,
  // stage 3 'MACD less than <minimumMACDLevel>'
  minimumMACDLevel: 0,
  // stage 4 'MACD closing' - takes <macdPriceLookupPeriod> period(s) and then uses <divergenceDistance> to
  // calulate whether or not MACD is closing
  // <macdConvergenceThreshold> the minimum distance between max histogram value and current histogram value
  macdConvergenceThreshold: 0.998,
  // <minimumHistogramValue> minimum value of histogram bar
  minimumHistogramValue: -0.3,
  // <macdSignalCrossedThreshold> how far away from signal line can macd be before considering it a good buy
  macdSignalCrossedThreshold: 1.18,
  // <macdPriceLookupPeriod> the amount of periods to find a max macd to get a V shape close
  macdPriceLookupPeriod: 3,
  // <divergenceDistance> the location to look for a max macd within the lookup period
  divergenceDistance: (macdPriceLookupPeriod) => { return Math.floor(macdPriceLookupPeriod / 2) },
  // P/L settings
  stopLossPercentage: 0.99,
  // 1 = 100% of money to use per trade
  percentageToUsePerTrade: 0.2,

  buyCondition: ({mostRecentPriceData, emaTarget, alreadyTouchedRSIThreshold, config, macdSlice, mostRecentTime, ema50}) => {
    if (mostRecentPriceData.price < emaTarget) {
      if (alreadyTouchedRSIThreshold) {
        console.log('Bounced off RSI threshold already')
        greenyLogs('Bounced off RSI threshold already')
        if (mostRecentPriceData.macd.histogram < config.minimumMACDLevel) {
          console.log('macd level valid')
          greenyLogs('macd level valid')

          let prevVal = Infinity
          for (const val of macdSlice) {
            if (val.macd.histogram < prevVal) {
              prevVal = val.macd.histogram
            }
          }
          // furthest divergence should be middle number of MACDS BELOW 0 so always negative hence >
          let divergence = config.divergenceDistance(config.macdPriceLookupPeriod)
          if (mostRecentPriceData.macd.histogram > (macdSlice[divergence].macd.histogram * config.macdConvergenceThreshold) && macdSlice[divergence].macd.histogram < config.minimumHistogramValue) {

            greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
            greenyLogs(mostRecentTime)
            greenyLogs('MACD macd: ' +mostRecentPriceData.macd.MACD)
            greenyLogs('MACD histo: ' + mostRecentPriceData.macd.histogram)
            greenyLogs('MACD signal: ' +mostRecentPriceData.macd.signal)
            greenyLogs('histo threshold: ' +(macdSlice[divergence].macd.histogram * config.macdConvergenceThreshold))
            greenyLogs('signal threshold: ' +(mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold))
            greenyLogs(mostRecentPriceData.macd.MACD + ' > ' + (mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold))
            greenyLogs(mostRecentPriceData.macd.MACD >= (mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold))
            greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

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

            if (mostRecentPriceData.macd.MACD >= (mostRecentPriceData.macd.signal*config.macdSignalCrossedThreshold) && mostRecentPriceData.rsi < config.rsiBuyInThreshold) {
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
        if (mostRecentPriceData.rsi <= config.rsiThreshold) {
          console.log('Touched RSI threshold')
          greenyLogs('Touched RSI threshold')
          return { signal: false, alreadyTouchedRSIThreshold: true }
        } else {
          return { signal: false, alreadyTouchedRSIThreshold: false }
        }
      }
    } else {
      return { signal: false, alreadyTouchedRSIThreshold: false }
    }
  },
  takeProfitCondition: ({rsi, currentHoldings, currentPrice, ema50, ema20, alreadyCrossedEma50, config}) => {
    // return currentPrice >= ema200 ? { signal: true } : { signal: false }
    if (alreadyCrossedEma50) {
      // Crossed EMA 50
      greenyLogs('@@@@@@@@ POTENTIAL SELL @@@@@@@@@@')
      console.log('@@@@@@@@ POTENTIAL SELL @@@@@@@@@@')
      // if (rsi > 65 && currentPrice >= currentHoldings.price && (currentPrice-currentHoldings.price)*currentHoldings.units > (currentHoldings.units*currentPrice)*0.001) {
      //   greenyLogs('Profitable RSI 65+')
      //   console.log('Profitable RSI 65+')
      //   return { signal: true, alreadyCrossedEma50: false }
      // }
      // if (currentPrice < ema50 && currentPrice >= currentHoldings.price && (currentPrice-currentHoldings.price)*currentHoldings.units > (currentHoldings.units*currentPrice)*0.001) {
      //   greenyLogs('Profitable crossing down onto ema 50')
      //   console.log('Profitable crossing down onto ema 50')
      //   return { signal: true, alreadyCrossedEma50: false }
      // }
      if (currentPrice < (ema50*config.ema50SLThreshold)&& (currentPrice-currentHoldings.price)*currentHoldings.units > (currentHoldings.units*currentPrice)*0.001) {
        greenyLogs('Down cross on non modified ema50 selling off...')
        console.log('Down cross on non modified ema50 selling off...')
        return { signal: true, alreadyCrossedEma50: false}
      }
      if ((ema20*config.ema20Above50Modifier) >= ema50 && (currentPrice-currentHoldings.price)*currentHoldings.units > (currentHoldings.units*currentPrice)*0.001) {
        greenyLogs('Ema20 Crossing up on ema50')
        console.log('Ema20 Crossing up on ema50')
        if (currentPrice <= (ema20*config.ema20TPModifier) && currentPrice > currentHoldings.price && (currentPrice-currentHoldings.price)*currentHoldings.units > (currentHoldings.units*currentPrice)*0.001) {
          greenyLogs('Current price > ema20 and ema20 > ema50')
          greenyLogs('congrats!')
          console.log('Current price > ema20 and ema20 > ema50')
          console.log('congrats!')
          return { signal: true, alreadyCrossedEma50: false }
        } else {
          return { signal: false, alreadyCrossedEma50: true }
        }
      } else {
        return { signal: false, alreadyCrossedEma50: true }
      }
    } else {
      // Not yet crossed EMA 50
      greenyLogs('Waiting for price to cross up on ema50')
      console.log('Waiting for price to cross up on ema50')
      if (currentPrice >= (ema50*config.emaModifier)) {
        // Just crossed EMA 50
        greenyLogs('Crossed ema50')
        console.log('Crossed ema50')
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
