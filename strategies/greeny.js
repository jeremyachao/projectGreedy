const greenyLogs = require('./greenyLogs')
const config = require('./greenyConfig').greeny
const indicators = require('technicalindicators')
const greenyState = require('./greenyState')

// HIGH PRIORITY
// @TODO: write strategy for buy sell above EMA
// @TODO: time is bugged on greenyLogs

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
  const appendedRates = _appendIndicatorValuesToList({ list: data.priceWithIndicators, ema20: greenyIndicators.ema20, ema50: greenyIndicators.ema50, rsi: greenyIndicators.rsi, macd: greenyIndicators.macd})
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
    ema50: greenyIndicators.ema50[ema50.length -1],
    ema20: greenyIndicators.ema20[ema20.length -1],
  }

  historicRates.priceWithIndicators.push(priceObject)
  historicRates.priceWithIndicators.shift()


  const results = _analyse(config, historicRates.priceWithIndicators, currentHoldings, wallet)

  return {decision: results.decision, currentPrice: results.currentPrice, profitLoss: results.profitLoss, totalValue: results.totalValue, units: results.units, time: results.time, hitSL: results.hitSL }
}

const _calculateIndicators = (values) => {
  ema50 = indicators.EMA.calculate({ period: 50, values})
  ema20 = indicators.EMA.calculate({ period: 20, values})
  rsi = indicators.RSI.calculate({values, period: 14})
  macd = indicators.MACD.calculate({values, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false})
  return { ema20, ema50, rsi, macd }
}

const _appendIndicatorValuesToList = ({list, rsi, macd, ema50}) => {
  const values = list
  // ema50
  let emaCounter = 0
  for (let i = 50; i < values.length; i++) {
    values[i].ema50 = ema50[emaCounter]
    emaCounter++
  }
  // ema20
  let ema20Counter = 0
  for (let i = 20; i < values.length; i++) {
    values[i].ema20 = ema20[ema20Counter]
    ema20Counter++
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
  let decision = 'NONE'

  const mostRecentPriceData = priceData[priceData.length - 1]
  const mostRecentTime = new Date(mostRecentPriceData.time * 1000)
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

    const result = config.takeProfitCondition(mostRecentPriceData.price, mostRecentPriceData.ema50, mostRecentPriceData.ema20, greenyState.states.alreadyCrossedEma50)
    greenyState.states.alreadyCrossedEma50 = result.alreadyCrossedEma50

    // console.log('>>>>>>>>>>>>><<<<<<<<<<<<<<<')
    // console.log('CURRENTLY HOLDING AN ASSET')
    // console.log('Current P/L: ' + profitLossValue)
    // console.log('Current Price: ' + mostRecentPriceData.price)
    // console.log('Already crossed 50: ' + greenyState.states.alreadyCrossedEma50)
    // console.log('>>>>>>>>>>>>><<<<<<<<<<<<<<<')

    greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
    greenyLogs('***LOOKING TO SELL***')
    greenyLogs('Current P/L: ' + profitLossValue)
    greenyLogs('Current Price: ' + mostRecentPriceData.price)
    greenyLogs('SL Price: ' + stopLossPrice)
    greenyLogs('UNITS BOUGHT: ' + unitsBought)
    greenyLogs('TOTAL VALUE WHEN BOUGHT: ' + unitsBought*currentHoldings.price)
    greenyLogs('CURRENT TOTAL VALUE: ' + totalCurrentValue)
    greenyLogs('----------------------------------------------')
    greenyLogs('Time: ' + mostRecentTime)
    greenyLogs('Price: ' + mostRecentPriceData.price)
    greenyLogs('EMA50: ' + mostRecentPriceData.ema50)
    greenyLogs('EMA20: ' + mostRecentPriceData.ema20)
    greenyLogs('EMA20 >= EMA50: ' + (mostRecentPriceData.ema20 >= mostRecentPriceData.ema50))
    greenyLogs('RSI: ' + mostRecentPriceData.rsi)
    greenyLogs('MACD histo: ' + mostRecentPriceData.macd.histogram)
    greenyLogs('Already crossed 50: ' + greenyState.states.alreadyCrossedEma50)
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
    } else if (result.signal) {
      greenyLogs('@@@@@@@@ SOLD @@@@@@@@@')
      greenyLogs('Current P/L: ' + profitLossValue)
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')
      decision = 'SELL'
    }

    return {decision, currentPrice: mostRecentPriceData.price, profitLoss: profitLossValue, units: unitsBought, totalValue: unitsBought*mostRecentPriceData.price, time: mostRecentTime, hitSL: mostRecentPriceData.price <= stopLossPrice}
  }
  // BUY LOGIC
  const buyCondition = config.buyCondition({ alreadyTouchedRSIThreshold: greenyState.states.alreadyTouchedRSIThreshold, config, emaTarget, macdSlice, mostRecentPriceData, mostRecentTime})
  greenyState.states.alreadyTouchedRSIThreshold = buyCondition.alreadyTouchedRSIThreshold
  if (buyCondition.signal) {
    greenyLogs('@@@@@@@@ BOUGHT @@@@@@@@@')
    greenyLogs('Bought at price: ' + mostRecentPriceData.price)
    greenyLogs('>>>>>>>>>>>>>>>>>>>>> BOUGHT END <<<<<<<<<<<<<<<<<<<<<')
    decision = 'BUY'
  }

  console.log('Time: ' + mostRecentTime)

  greenyLogs('----------------------------------------------')
  greenyLogs('Time: ' + mostRecentTime)
  greenyLogs('Price: ' + mostRecentPriceData.price)
  greenyLogs('EMA50: ' + mostRecentPriceData.ema50)
  greenyLogs('RSI: ' + mostRecentPriceData.rsi)
  greenyLogs('MACD histo: ' + mostRecentPriceData.macd.histogram)
  greenyLogs('EMA target: ' + emaTarget)
  greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

  return {decision, currentPrice: mostRecentPriceData.price, profitLoss: 'N/A', units: unitsToBuy, time: mostRecentTime}
}
