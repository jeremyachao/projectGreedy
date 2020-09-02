const config = require('./config')
const strategies = require('./strategies')
const fs = require('fs');
const Binance = require('binance-api-node').default
const transactionLogs = require('./transactionLogs')


/*
  Current issues:
  - get historical prices only updates once every 5 mins, so u cant spam restart the app
  - not sure why MACD is not the same as trading view MACD
  - not sure if i should calculate indicators on current price or price one minute ago
*/

// HIGH PRIORITY
// @TODO: add or remove funds to available amount after each trade for P/L

// LOW PRIORITY
// @TODO: implement get any active holdings from binance

const _displayEndMessage = (sessionTransactions) => {
  let totalBuy = 0
  let totalSell = 0
  let averagePL = 0
  let sellCount = 0
  let totalTradesCount = 0
  let goodTradesCount = 0
  let hitSLCount = 0
  let avgPercentGain = 0
  let avgPercentLoss = 0
  let badTradesCount = 0
  let totalTakerFee = 0
  const fileName = './greeny-RESULTS'

  // // @TODO: remove
  // if (sessionTransactions[sessionTransactions.length -1].action === 'BUY') {
  //   sessionTransactions.pop()
  // }

  for (const transaction of sessionTransactions) {
    fs.appendFileSync(fileName, JSON.stringify(transaction) + '\r\n')

    if (transaction.action === 'BUY') {
      totalTakerFee += transaction.takerFee
      totalBuy += transaction.totalValue
    }
    if (transaction.action === 'SELL') {
      totalTradesCount++
      averagePL += transaction.profitLoss
      totalTakerFee += transaction.takerFee
      sellCount++
      totalSell += transaction.totalValue
      if (transaction.profitLoss > 0) {
        avgPercentGain += (transaction.profitLoss/transaction.totalValue)*100
        goodTradesCount++
      }
      if (transaction.profitLoss < 0) {
        avgPercentLoss += (Math.abs(transaction.profitLoss)/transaction.totalValue)*100
        badTradesCount++
      }
      if (transaction.hitSL) {
        hitSLCount++
      }
    }
  }
  let profitLoss = totalSell - totalBuy
  console.log('-------FINISHED FEED-----')
  console.log('----------------------------------------------')
  console.log('***TRANSACTIONS****')
  console.log(sessionTransactions)
  console.log('----------------------------------------------')
  console.log('***PERFORMANCE****')
  console.log('----------------------------------------------')
  console.log(config.BINANCE_INSTRUMENT)
  console.log('----------------------------------------------')
  console.log('PROFIT/LOSS: ' + profitLoss)
  console.log('TOTAL TAKER FEE: ' + totalTakerFee)
  console.log('PROFIT/LOSS % ON TOTAL SPENT : ' + ((profitLoss/totalBuy)*100))
  console.log('TAKER FEE % ON TOTAL SPENT: ' + ((totalTakerFee/totalBuy)*100))
  console.log('TAKER FEE AS % OF P/L: ' + (Math.abs((totalTakerFee/profitLoss)*100)))
  console.log('----------------------------------------------')
  console.log('NET PROFIT LOSS: ' + (profitLoss - totalTakerFee))
  console.log('NET PROFIT LOSS %: ' + ((profitLoss - totalTakerFee)/totalBuy)*100)
  console.log('----------------------------------------------')
  console.log('TOTAL BOUGHT: ' + totalBuy)
  console.log('TOTAL SOLD: ' + totalSell)
  console.log('TOTAL TRADES: ' + totalTradesCount)
  console.log('----------------------------------------------')
  console.log('HIT SL %: ' + (hitSLCount/totalTradesCount*100))
  console.log('PROFITABLE TRADES %: ' + (goodTradesCount/totalTradesCount * 100))
  console.log('----------------------------------------------')
  console.log('AVERAGE P/L PER TRADE: ' + averagePL/sellCount)
  console.log('AVERAGE TAKER FEE: ' + totalTakerFee/totalTradesCount)
  console.log('AVG % GAIN ON GOOD TRADES: ' + (avgPercentGain/goodTradesCount))
  console.log('AVG % LOSS ON BAD TRADES: ' + (avgPercentLoss/badTradesCount))
  console.log('----------------------------------------------')
  console.log('SAVED TO: ' + fileName)
}

const _executeBuy = (currentPrice, units, time, takerFee, totalValue) => {
  return { time: time, msg: 'BOUGHT ' + units +  ' UNITS AT: ' + currentPrice, price: currentPrice, action: 'BUY', totalValue: totalValue, units: units, takerFee}
}

const _executeSell = (currentPrice, profitLoss, units, totalValue, time, hitSL, takerFee) => {
  return { time: time, msg: 'SOLD ' + units + ' UNITS AT: ' + currentPrice, price: currentPrice, profitLoss: profitLoss, action: 'SELL', totalValue: totalValue, units: units, hitSL: hitSL, takerFee}
}

const _executeHold = (currentPrice) => {
  return 'HOLDING AT: ' + currentPrice
}

const _noCurrentTransactions = () => {
  return 'No current transactions'
}

/*
  This is executed every interval
*/
const _implementStrategy = ({ historicRates, currentHoldings, strategy, tickerData, sessionTransactions, wallet}) => {
  // executes strategy
  const strategyExecutionResult = strategy({historicRates, currentHoldings, wallet, tickerData})

  const lastStatus = _getLastStatus(strategyExecutionResult)
  // Keeps track of open positions
  if (lastStatus.action === 'BUY' || lastStatus.action === 'SELL') {
    sessionTransactions.push(lastStatus)
    if (lastStatus.action === 'BUY') {
      currentHoldings = lastStatus
    }
    if (lastStatus.action === 'SELL') {
      currentHoldings = 0
    }
  }
  return {currentHoldings, decision: strategyExecutionResult}
}

const _getLastStatus = ({currentPrice, decision, profitLoss, units, totalValue, time, hitSL, takerFee}) => {
  const states = {
    'BUY': _executeBuy(currentPrice, units, time, takerFee, totalValue),
    'SELL': _executeSell(currentPrice, profitLoss, units, totalValue, time, hitSL, takerFee),
    'HOLD': _executeHold(currentPrice),
    'NONE': _noCurrentTransactions(),
  }
  return states[decision]
}



const _feedThroughTestEnvironment = ({historicRates, sessionTransactions, wallet, strategy}) => {
  console.log('@@@ TEST ENV @@@')
  const testFeedSpeed = 10
  const testHistoricPriceIndicator= historicRates.priceWithIndicators.slice(0, 60)
  const testHistoricPrice = historicRates.price.slice(0,60)
  const testFeed = historicRates.priceWithIndicators.slice(60, historicRates.length)

  const testHistoricRates = { price: testHistoricPrice, priceWithIndicators: testHistoricPriceIndicator}

  let testCurrentPrice = 0
  let testCounter = 0
  let result = { decision: 'NONE', currentHoldings: 0}
  let testlastStatus = 'NONE'

  let interval = setInterval(()=>{
    if (testCounter < testFeed.length) {
      // NOTE: real version uses counter to countdown and THEN execute strategy
      testCurrentPrice = testFeed[testCounter].price
      testCurrentTime = new Date(testFeed[testCounter].time)
      testCounter++
      let tickerData = {
        currentPrice: testCurrentPrice,
        time: testCurrentTime
      }
      // NOTE: this is different size from real historicRates
      result = _implementStrategy({ sessionTransactions, currentHoldings: result.currentHoldings, historicRates: testHistoricRates, strategy, tickerData, wallet })
      if (result.decision.decision === 'BUY') {
        console.log('MOCK BUY')
      }
      if (result.decision.decision === 'SELL') {
        console.log('MOCK SELL')
      }
    } else {
      _displayEndMessage(sessionTransactions)
      clearInterval(interval)
    }
  }, testFeedSpeed)
}

// not exactly synced up to real time seconds, it probably will gradually slip
const _feedThroughWebSocket = async ({client, websocket, historicRates, sessionTransactions, wallet, strategy, instrument}) => {
  let period = config.TIME_PERIOD_SECONDS
  let result = { decision: 'NONE', currentHoldings: 0}
  const minutesLeftIn5m = (((Math.ceil(new Date().getMinutes()/(period/60)))*(period/60))-new Date().getMinutes())
  let counter = (minutesLeftIn5m*60) - new Date().getSeconds()
  let buyOrder
  let sellOrder
  // let counter = period - new Date().getSeconds()
  const interval = setInterval(async () => {
    console.log(counter)
    if (counter === 0) {
      const currentCandle = await client.candles({ symbol: config.BINANCE_INSTRUMENT, limit: 1, interval: config.TIME_PERIOD })
      result = _implementStrategy({ sessionTransactions, currentHoldings: result.currentHoldings, historicRates, strategy, tickerData: { currentPrice: currentCandle[0].close, time: new Date(currentCandle[0].closeTime) }, wallet })
      if (result.decision.decision === 'BUY') {
        console.log('BUY IN')
        buyOrder = await client.order({
          symbol: config.BINANCE_INSTRUMENT,
          side: 'BUY',
          quantity: config.BUY_QUANTITY,
          type: 'MARKET'
        })
        transactionLogs(JSON.stringify(buyOrder))
        console.log(buyOrder)
      }
      if (result.decision.decision === 'SELL') {
        console.log('SELL OFF')
        sellOrder = await client.order({
          symbol: config.BINANCE_INSTRUMENT,
          side: 'SELL',
          quantity: config.BUY_QUANTITY - (config.BUY_QUANTITY * wallet.takerFee),
          type: 'MARKET'
        })
        transactionLogs(JSON.stringify(sellOrder))
        console.log(sellOrder)
      }
      counter = period
    }
    counter--
  }, 1000)
}

const _getHistoricRates = async ({clientMethod, strategyPreprocessing, instrument, startEnd=false}) => {
  let historicRates = { price: [], priceWithIndicators: []}
  const rates = startEnd ? await clientMethod({symbol: instrument, startTime: startEnd.start, endTime: startEnd.end, interval: config.TIME_PERIOD }) : await clientMethod({symbol: instrument, interval: config.TIME_PERIOD})
  // [ 0: oldest,  length-1: newest ]
  for (const candle of rates) {
    historicRates.price.push(parseFloat(candle.close))
    historicRates.priceWithIndicators.push({ price: parseFloat(candle.close), time: candle.closeTime})
  }
  return strategyPreprocessing ? strategyPreprocessing(historicRates) : historicRates
}


const _getAvailableBalance = async ({client, instrument}) => {
  let amountAvailable
  let makerFee
  let takerFee
  const balances = await client.accountInfo()
  for (const bal of balances.balances) {
    if (bal.asset === instrument.substring(3, 7)) {
      console.log(bal)
      amountAvailable = bal.free
    }
  }
  const fees = await client.tradeFee()
  for (const f of fees.tradeFee) {
    if (f.symbol === config.BINANCE_INSTRUMENT) {
      makerFee = f.maker
      takerFee = f.taker
    }
  }
  return { amountAvailable, makerFee, takerFee }
}
const main = async () => {
  const sessionTransactions = []
  const binanceClient = Binance({apiKey: config.BINANCE_API_KEY, apiSecret: config.BINANCE_SECRET_KEY})
  const websocket = binanceClient.ws.candles
  console.log('****************************************')

  const wallet = await _getAvailableBalance({client: binanceClient, instrument: config.BINANCE_INSTRUMENT})
  console.log(wallet)

  // starts 1 hr after start
  const startEnd = {
    start: Date.parse('2020-08-27T09:00:00+0100'),
    end: Date.parse('2020-08-27T17:00:00+0100')
  }
  const strategy = { strategy: strategies.greenyNotGreedy, strategyPreprocessing: strategies.greenyPreprocessing }
  const historicRates = await _getHistoricRates({ clientMethod: binanceClient.candles, strategyPreprocessing: strategy.strategyPreprocessing, instrument: config.BINANCE_INSTRUMENT, startEnd: false})
  _feedThroughWebSocket({client: binanceClient, websocket, historicRates, sessionTransactions, wallet, strategy: strategies.greenyNotGreedy, instrument: config.BINANCE_INSTRUMENT})

  // const historicRatesPeriodTest = await _getHistoricRatesPeriodTest({ clientMethod: binanceClient.candles, strategyPreprocessing: strategy.strategyPreprocessing, instrument: config.BINANCE_INSTRUMENT})
  // _feedThroughTestEnvironment({ historicRates, sessionTransactions, wallet, strategy: strategy.strategy})



  // Shutdown process
  if (process.platform === "win32") {
  var rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function () {
    process.emit("SIGINT");
  });
  }

  process.on("SIGINT", function () {
    _displayEndMessage(sessionTransactions)
    fs.unlinkSync('./greenyLogFile')
    fs.unlinkSync('./greeny-RESULTS')
    process.exit();
  });

}

const _getHistoricRatesPeriodTest = async ({clientMethod, strategyPreprocessing, instrument}) => {
  let historicRates = { price: [], priceWithIndicators: []}
  let counter = 0

  let startDate = 25
  const testingPeriod = [
    { start: Date.parse(`2020-08-${startDate}T00:00:00+0100`) , end: Date.parse(`2020-08-${startDate}T03:59:00+0100`)},
    { start: Date.parse(`2020-08-${startDate}T04:00:00+0100`) , end: Date.parse(`2020-08-${startDate}T07:59:00+0100`)},
    { start: Date.parse(`2020-08-${startDate}T08:00:00+0100`) , end: Date.parse(`2020-08-${startDate}T11:59:00+0100`)},
    { start: Date.parse(`2020-08-${startDate}T12:00:00+0100`) , end: Date.parse(`2020-08-${startDate}T15:59:00+0100`)},
    { start: Date.parse(`2020-08-${startDate}T16:00:00+0100`) , end: Date.parse(`2020-08-${startDate}T19:59:00+0100`)},
    { start: Date.parse(`2020-08-${startDate}T20:00:00+0100`) , end: Date.parse(`2020-08-${startDate}T23:59:00+0100`)},
  ]

  let rates = []

  for (period of testingPeriod) {
    console.log('@@@@ BUILDING DATASET...... @@@@')
    console.log(testingPeriod[counter])
    const tmp = await clientMethod({symbol: instrument, startTime: testingPeriod[counter].start, endTime: testingPeriod[counter].end, interval: config.TIME_PERIOD })
    rates = rates.concat(tmp)
    counter++
    console.log(rates.length)
  }
  console.log('Done...')

  // [ 0: oldest,  length-1: newest ]
  for (const candle of rates) {
    historicRates.price.push(parseFloat(candle.close))
    historicRates.priceWithIndicators.push({ price: parseFloat(candle.close), time: candle.closeTime})
  }

  return strategyPreprocessing ? strategyPreprocessing(historicRates) : historicRates

}


(async ()=> { main() })()
