const greenyLogs = require('./greenyLogs')
const config = require('./greenyConfig').greeny

// @TODO: risky trading low value crypto's like XRP because as of now, EMA is not the same as trading view
const greeny = ({client, historicRates, currentHoldings}) => {
  const values = historicRates.priceWithIndicators
  const results = _analyse(config, values, currentHoldings)

  return {decision: results.decision, currentPrice: results.currentPrice, profitLoss: results.profitLoss}
}

// @TODO: implement valuation model -> (close - open) x units
const _analyse = (config, priceData, currentHoldings) => {
  let emaStatus = false
  let rsiStatus = false
  let macdStatus = false
  let macdZeroStatus = false

  let decision = 'NONE'

  const mostRecentPriceData = priceData[priceData.length - 1]
  const macdSlice = priceData.slice(priceData.length - config.macdPriceLookupPeriod, priceData.length)
  const emaTarget =  mostRecentPriceData.ema50 * ((100 - config.crossedEmaThreshold)/100)
  const stopLossPrice = currentHoldings.price * ((100 - config.stopLossPercentage)/100)


  // limit to 1 order
  if (currentHoldings !== 0) {
    console.log('CURRENT HOLDINGS > 0')
    console.log('Current P/L: ' + (mostRecentPriceData.price - currentHoldings.price))
    console.log('Current Price: ' + mostRecentPriceData.price)
    greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
    greenyLogs('***LOOKING TO SELL***')
    greenyLogs('Current P/L: ' + (mostRecentPriceData.price - currentHoldings.price))
    greenyLogs('Current Price: ' + mostRecentPriceData.price)
    greenyLogs('SL Price: ' + stopLossPrice)
    greenyLogs('----------------------------------------------')
    greenyLogs('Time: ' + mostRecentPriceData.time)
    greenyLogs('Price: ' + mostRecentPriceData.price)
    greenyLogs('EMA: ' + mostRecentPriceData.ema50)
    greenyLogs('RSI: ' + mostRecentPriceData.rsi)
    greenyLogs('MACD histo: ' + mostRecentPriceData.macd.histogram)
    greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

    let decision = 'HOLD'
    // SELL LOGIC
    if (mostRecentPriceData.price <= stopLossPrice) {
      greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
      greenyLogs('@@@@ STOP LOSS TRIGGERED @@@')
      greenyLogs('SL Price: ' + stopLossPrice)
      greenyLogs('Current P/L: ' + (mostRecentPriceData.price - currentHoldings.price))
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')
      decision = 'SELL'
    } else if (config.takeProfitCondition(mostRecentPriceData.price, mostRecentPriceData.ema50)) {
      greenyLogs('@@@@@@@@ SOLD @@@@@@@@@')
      greenyLogs('Current P/L: ' + (mostRecentPriceData.price - currentHoldings.price))
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')
      decision = 'SELL'
    }

    return {decision, currentPrice: mostRecentPriceData.price, profitLoss: mostRecentPriceData.price - currentHoldings.price}
  }
  // BUY LOGIC
  if (mostRecentPriceData.price < emaTarget) {
    emaStatus = true
    if (mostRecentPriceData.rsi < config.rsiThreshold) {
      rsiStatus = true
      if (mostRecentPriceData.macd.histogram < config.minimumMACDLevel) {
        greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
        greenyLogs('@@@@@@@@@@@@ POTENTIAL BUY WINDOW @@@@@@@@@@@@@@@@')
        macdZeroStatus = true

        let prevVal = Infinity
        for (const val of macdSlice) {
          if (val.macd.histogram < prevVal) {
            prevVal = val.macd.histogram
          }
        }

        greenyLogs('current: ' + macdSlice[2].macd.histogram)
        greenyLogs('prev: ' + macdSlice[1].macd.histogram)
        greenyLogs('max: ' + prevVal)

        // furthest divergence should be middle number
        let divergence = config.divergenceDistance(config.macdPriceLookupPeriod)
        if (macdSlice[divergence].macd.histogram === prevVal) {
          macdStatus = true
          decision = 'BUY'
        }

      }
    }
  }

  greenyLogs('----------------------------------------------')
  greenyLogs('Time: ' + mostRecentPriceData.time)
  greenyLogs('Price: ' + mostRecentPriceData.price)
  greenyLogs('EMA: ' + mostRecentPriceData.ema50)
  greenyLogs('RSI: ' + mostRecentPriceData.rsi)
  greenyLogs('MACD histo: ' + mostRecentPriceData.macd.histogram)
  greenyLogs('************')
  greenyLogs('Stage1: ' + 'Price under ema by atleast ' + config.crossedEmaThreshold + '%: ' + emaStatus)
  greenyLogs('Stage2: ' + 'Price RSI < ' + config.rsiThreshold + ': ' + rsiStatus)
  greenyLogs('Stage3: ' + 'MACD less than ' + config.minimumMACDLevel + ': '+ macdZeroStatus)
  greenyLogs('Stage4: ' + 'MACD closing: ' + macdStatus)
  greenyLogs('************')
  greenyLogs('EMA target: ' + emaTarget)
  greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

  return {decision, currentPrice: mostRecentPriceData.price, profitLoss: 'N/A'}
}

module.exports = greeny
