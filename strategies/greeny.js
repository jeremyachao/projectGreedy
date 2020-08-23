const greenyLogs = require('./greenyLogs')
const config = require('./greenyConfig').greeny
const indicators = require('technicalindicators')

// HIGH PRIORITY
// @TODO: write strategy for buy sell above EMA

// LOW PRIORITY
// @NOTE: risky trading low value crypto's like XRP because as of now, EMA is not the same as trading view
// @TODO: handle sell for already existing holdings
// @TODO: handle trying to /sudden close of bot
// @TODO: gradient calculation to determine better thresholds for TP/SL?
// @TODO: write testing environment for multiple days (and metrics display for this)


/*
  Called in _getHistoricRates in index.js
*/
exports.greenyPreprocessing = (data) => {
  const greenyReadyData = data
  const greenyIndicators = _calculateIndicators(greenyReadyData.price)
  const appendedRates = _appendIndicatorValuesToList({ list: data.priceWithIndicators, ema50: greenyIndicators.ema50, rsi: greenyIndicators.rsi, macd: greenyIndicators.macd})
  greenyReadyData.priceWithIndicators = appendedRates
  return data
}

exports.greenyNotgreedy = ({historicRates, currentHoldings, wallet, tickerData}) => {
  // technical indicators libraries is easiest used with pure lists
  historicRates.price.push(tickerData.currentPrice)
  historicRates.price.shift()

  const greenyIndicators = _calculateIndicators(historicRates.price)

  const priceObject = {
    price: tickerData.currentPrice,
    time: tickerData.time,
    rsi: greenyIndicators.rsi[rsi.length-1],
    macd: greenyIndicators.macd[macd.length -1],
    ema50: greenyIndicators.ema50[ema50.length -1]
  }

  historicRates.priceWithIndicators.push(priceObject)
  historicRates.priceWithIndicators.shift()


  const results = _analyse(config, historicRates.priceWithIndicators, currentHoldings, wallet)

  return {decision: results.decision, currentPrice: results.currentPrice, profitLoss: results.profitLoss, totalValue: results.totalValue, units: results.units, time: results.time, hitSL: results.hitSL }
}

const _calculateIndicators = (values) => {
  ema50 = indicators.EMA.calculate({ period: 50, values})
  rsi = indicators.RSI.calculate({values, period: 14})
  macd = indicators.MACD.calculate({values, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false})
  return { ema50, rsi, macd }
}

const _appendIndicatorValuesToList = ({list, rsi, macd, ema50}) => {
  const values = list
  // ema50
  let emaCounter = 0
  for (let i = 50; i < values.length; i++) {
    values[i].ema50 = ema50[emaCounter]
    emaCounter++
  }
  // rsi 14
  let rsiCounter = 0
  for (let i = 14; i < values.length; i++){
    values[i].rsi = rsi[rsiCounter]
    rsiCounter++
  }
  // macd 12 26 9
  let macdCounter = 0
  for (let i = 26; i < values.length; i++){
    values[i].macd = macd[macdCounter]
    macdCounter++
  }
  return list
}

const _analyse = (config, priceData, currentHoldings, wallet) => {
  let emaStatus = false
  let rsiStatus = false
  let macdStatus = false
  let macdZeroStatus = false

  let decision = 'NONE'

  const mostRecentPriceData = priceData[priceData.length - 1]
  const macdSlice = priceData.slice(priceData.length - config.macdPriceLookupPeriod, priceData.length)
  const emaTarget =  mostRecentPriceData.ema50 * ((100 - config.crossedEmaThreshold)/100)
  const stopLossPrice = currentHoldings.price * ((100 - config.stopLossPercentage)/100)

  const availableMoneyForTrade = wallet.amountAvailable * config.percentageToUsePerTrade
  const unitsToBuy = availableMoneyForTrade / mostRecentPriceData.price
  const unitsBought = currentHoldings.units
  const profitLossValue = ((mostRecentPriceData.price - currentHoldings.price)*unitsToBuy)
  const totalCurrentValue = unitsToBuy*mostRecentPriceData.price


  // limit to 1 order
  if (currentHoldings !== 0) {
    console.log('CURRENT HOLDINGS > 0')
    console.log('Current P/L: ' + profitLossValue)
    console.log('Current Price: ' + mostRecentPriceData.price)
    greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
    greenyLogs('***LOOKING TO SELL***')
    greenyLogs('Current P/L: ' + profitLossValue)
    greenyLogs('Current Price: ' + mostRecentPriceData.price)
    greenyLogs('SL Price: ' + stopLossPrice)
    greenyLogs('UNITS BOUGHT: ' + unitsBought)
    greenyLogs('TOTAL VALUE WHEN BOUGHT: ' + unitsBought*currentHoldings.price)
    greenyLogs('CURRENT TOTAL VALUE: ' + totalCurrentValue)
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
      greenyLogs('Current P/L: ' + profitLossValue)
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')
      decision = 'SELL'
    } else if (config.takeProfitCondition(mostRecentPriceData.price, mostRecentPriceData.ema50)) {
      greenyLogs('@@@@@@@@ SOLD @@@@@@@@@')
      greenyLogs('Current P/L: ' + profitLossValue)
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')
      decision = 'SELL'
    }

    return {decision, currentPrice: mostRecentPriceData.price, profitLoss: profitLossValue, units: unitsBought, totalValue: unitsBought*mostRecentPriceData.price, time: mostRecentPriceData.time, hitSL: mostRecentPriceData.price <= stopLossPrice}
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

  return {decision, currentPrice: mostRecentPriceData.price, profitLoss: 'N/A', units: unitsToBuy, time: mostRecentPriceData.time}
}
