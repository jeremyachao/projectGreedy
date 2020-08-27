const greenyLogs = require('./greenyLogs')
const config = require('./greenyConfig').greeny
const indicators = require('technicalindicators')
const greenyState = require('./greenyState')

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

  return {decision: results.decision, currentPrice: results.currentPrice, profitLoss: results.profitLoss, totalValue: results.totalValue, units: results.units, time: results.time, hitSL: results.hitSL, takerFee: results.takerFee }
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
  const mostRecentTime = mostRecentPriceData.time.toString()
  const macdSlice = priceData.slice(priceData.length - config.macdPriceLookupPeriod, priceData.length)
  const emaTarget =  mostRecentPriceData.ema50 * config.crossedEmaThreshold

  const availableMoneyForTrade = wallet.amountAvailable * config.percentageToUsePerTrade
  const unitsToBuy = availableMoneyForTrade/mostRecentPriceData.price
  const totalCurrentValue = unitsToBuy*mostRecentPriceData.price
  const takerFee = parseFloat(totalCurrentValue * wallet.takerFee)



  // limit to 1 order
  if (currentHoldings !== 0) {
    const unitsBought = currentHoldings.units
    const profitLossValue = ((mostRecentPriceData.price - currentHoldings.price)*unitsBought)
    const stopLossPrice = currentHoldings.price * config.stopLossPercentage
    const totalSellValue = unitsBought*mostRecentPriceData.price
    const totalSellTakerFee = totalSellValue * wallet.takerFee
    const result = config.takeProfitCondition({ currentHoldings: currentHoldings, currentPrice: mostRecentPriceData.price, ema50: mostRecentPriceData.ema50, ema20: mostRecentPriceData.ema20, alreadyCrossedEma50: greenyState.states.alreadyCrossedEma50, config})
    greenyState.states.alreadyCrossedEma50 = result.alreadyCrossedEma50

    console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
    console.log('***LOOKING TO SELL***')
    console.log('Time: ' + mostRecentTime)
    console.log('Current P/L: ' + profitLossValue)
    console.log('Current price: ' + mostRecentPriceData.price)
    console.log('TakerFee: ' + totalSellTakerFee)
    console.log('SL price: ' + stopLossPrice)
    console.log('----------------------------------------------')
    console.log('Price when bought: ' + currentHoldings.price)
    console.log('Units bought: ' + unitsBought)
    console.log('Total value when bought: ' + currentHoldings.totalValue)
    console.log('Current total value: ' + totalSellValue)
    console.log('----------------------------------------------')
    console.log('EMA50: ' + mostRecentPriceData.ema50)
    console.log('EMA50 target: ' + emaTarget)
    console.log('EMA50 modifier: ' + (config.emaModifier*mostRecentPriceData.ema50))
    console.log('Already crossed 50: ' + greenyState.states.alreadyCrossedEma50)
    console.log('EMA20: ' + mostRecentPriceData.ema20)
    console.log('EMA20*Modifier: ' + mostRecentPriceData.ema20*config.ema20Above50Modifier)
    console.log('EMA20*Modifier >= EMA50: ' + ((mostRecentPriceData.ema20*config.ema20Above50Modifier) >= mostRecentPriceData.ema50))
    console.log('----------------------------------------------')
    console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

    greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
    greenyLogs('***LOOKING TO SELL***')
    greenyLogs('Time: ' + mostRecentTime)
    greenyLogs('Current P/L: ' + profitLossValue)
    greenyLogs('Current price: ' + mostRecentPriceData.price)
    greenyLogs('TakerFee: ' + totalSellTakerFee)
    greenyLogs('SL price: ' + stopLossPrice)
    greenyLogs('----------------------------------------------')
    greenyLogs('Price when bought: ' + currentHoldings.price)
    greenyLogs('Units bought: ' + unitsBought)
    greenyLogs('Total value when bought: ' + currentHoldings.totalValue)
    greenyLogs('Current total value: ' + totalSellValue)
    greenyLogs('----------------------------------------------')
    greenyLogs('EMA50: ' + mostRecentPriceData.ema50)
    greenyLogs('EMA50 target: ' + emaTarget)
    greenyLogs('EMA50 modifier: ' + (config.emaModifier*mostRecentPriceData.ema50))
    greenyLogs('Already crossed 50: ' + greenyState.states.alreadyCrossedEma50)
    greenyLogs('EMA20: ' + mostRecentPriceData.ema20)
    greenyLogs('EMA20*Modifier: ' + mostRecentPriceData.ema20*config.ema20Above50Modifier)
    greenyLogs('EMA20*Modifier >= EMA50: ' + ((mostRecentPriceData.ema20*config.ema20Above50Modifier) >= mostRecentPriceData.ema50))
    greenyLogs('----------------------------------------------')
    greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

    let decision = 'HOLD'

    // SELL LOGIC
    if (mostRecentPriceData.price <= stopLossPrice) {

      console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
      console.log('@@@@ STOP LOSS TRIGGERED @@@')
      console.log('Time: ' + mostRecentTime)
      console.log('SL Price: ' + stopLossPrice)
      console.log('Current P/L: ' + profitLossValue)
      console.log('TakerFee: ' + totalSellTakerFee)
      console.log('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')

      greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
      greenyLogs('@@@@ STOP LOSS TRIGGERED @@@')
      greenyLogs('Time: ' + mostRecentTime)
      greenyLogs('SL Price: ' + stopLossPrice)
      greenyLogs('Current P/L: ' + profitLossValue)
      greenyLogs('TakerFee: ' + totalSellTakerFee)
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')

      decision = 'SELL'
    } else if (result.signal) {
      console.log('@@@@@@@@ SOLD @@@@@@@@@')
      console.log('Time: ' + mostRecentTime)
      console.log('Current P/L: ' + profitLossValue)
      console.log('TakerFee: ' + totalSellTakerFee)
      console.log('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')

      greenyLogs('@@@@@@@@ SOLD @@@@@@@@@')
      greenyLogs('Time: ' + mostRecentTime)
      greenyLogs('Current P/L: ' + profitLossValue)
      greenyLogs('TakerFee: ' + totalSellTakerFee)
      greenyLogs('>>>>>>>>>>>>>>>>>>>>> END <<<<<<<<<<<<<<<<<<<<<')
      decision = 'SELL'
    }

    return {decision, currentPrice: mostRecentPriceData.price, profitLoss: profitLossValue, units: unitsBought, totalValue: totalSellValue, time: mostRecentTime, hitSL: mostRecentPriceData.price <= stopLossPrice, takerFee: totalSellTakerFee}
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

  console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
  console.log('No Holdings')
  console.log('Time: ' + mostRecentTime)
  console.log('----------------------------------------------')
  console.log('Price: ' + mostRecentPriceData.price)
  console.log('TakerFee: ' + takerFee)
  console.log('----------------------------------------------')
  console.log('EMA50: ' + mostRecentPriceData.ema50)
  console.log('EMA20: ' + mostRecentPriceData.ema20)
  console.log('----------------------------------------------')
  console.log('EMA50 target: ' + emaTarget)
  console.log('EMA50 modifier: ' + (config.emaModifier*mostRecentPriceData.ema50))
  console.log('----------------------------------------------')
  console.log('RSI: ' + mostRecentPriceData.rsi)
  console.log('----------------------------------------------')
  console.log('RSI Threshold: ' + config.rsiThreshold)
  console.log('----------------------------------------------')
  console.log('MACD: ' + mostRecentPriceData.macd.MACD)
  console.log('MACD signal: ' + mostRecentPriceData.macd.signal)
  console.log('MACD histo: ' + mostRecentPriceData.macd.histogram)
  console.log('----------------------------------------------')
  console.log('MACD convergence threshold: ' + (config.macdConvergenceThreshold*mostRecentPriceData.macd.histogram))
  console.log('MACD histogram minimum level under: ' + config.minimumMACDLevel)
  console.log('MACD signal crossed threshold: ' + (config.macdSignalCrossedThreshold*mostRecentPriceData.macd.signal))
  console.log('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

  greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')
  greenyLogs('No Holdings')
  greenyLogs('Time: ' + mostRecentTime)
  greenyLogs('----------------------------------------------')
  greenyLogs('Price: ' + mostRecentPriceData.price)
  greenyLogs('TakerFee: ' + takerFee)
  greenyLogs('----------------------------------------------')
  greenyLogs('EMA50: ' + mostRecentPriceData.ema50)
  greenyLogs('EMA20: ' + mostRecentPriceData.ema20)
  greenyLogs('----------------------------------------------')
  greenyLogs('EMA50 target: ' + emaTarget)
  greenyLogs('EMA50 modifier: ' + (config.emaModifier*mostRecentPriceData.ema50))
  greenyLogs('----------------------------------------------')
  greenyLogs('RSI: ' + mostRecentPriceData.rsi)
  greenyLogs('----------------------------------------------')
  greenyLogs('RSI Threshold: ' + config.rsiThreshold)
  greenyLogs('----------------------------------------------')
  greenyLogs('MACD: ' + mostRecentPriceData.macd.MACD)
  greenyLogs('MACD signal: ' + mostRecentPriceData.macd.signal)
  greenyLogs('MACD histo: ' + mostRecentPriceData.macd.histogram)
  greenyLogs('----------------------------------------------')
  greenyLogs('MACD convergence threshold: ' + (config.macdConvergenceThreshold*mostRecentPriceData.macd.histogram))
  greenyLogs('MACD histogram minimum level under: ' + config.minimumMACDLevel)
  greenyLogs('MACD signal crossed threshold: ' + (config.macdSignalCrossedThreshold*mostRecentPriceData.macd.signal))
  greenyLogs('>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<')

  return {decision, currentPrice: mostRecentPriceData.price, profitLoss: 'N/A', units: unitsToBuy, time: mostRecentTime, takerFee: takerFee}
}
