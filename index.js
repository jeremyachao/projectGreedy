const CoinbasePro = require('coinbase-pro')
const config = require('./config')
const strategies = require('./strategies')
const fs = require('fs');
const Shrimpy = require('shrimpy-node');
const Binance = require('binance-api-node').default


/*
  Current issues:
  - get historical prices only updates once every 5 mins, so u cant spam restart the app
  - not sure why MACD is not the same as trading view MACD
  - not sure if i should calculate indicators on current price or price one minute ago
*/

// HIGH PRIORITY
// @TODO: try only use binance api
// @TODO: trade BTC/USDT
// @TODO: take into account maker fees when calculating P/L and TP
// @TODO: figure out buy sell system because it takes away 0.01 QUANTITY when BUY and SELL

// LOW PRIORITY
// @TODO: implement get any active holdings from coinbase
// @TODO: use actual ask and bid to calculate profits
// TODO: clean candle of rates loop up, no need time and maybe no need to declare indicators there




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

  // @TODO: remove
  if (sessionTransactions[sessionTransactions.length -1].action === 'BUY') {
    sessionTransactions.pop()
  }

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
  console.log('PROFIT/LOSS % ON TOTAL SPENT : ' + ((Math.abs(profitLoss)/totalBuy)*100))
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
  let period = 60
  let result = { decision: 'NONE', currentHoldings: 0}

  let counter = (period - new Date().getSeconds())
  const interval = setInterval(async () => {
    console.log(counter)
    if (counter === 0) {
      const currentCandle = await client.candles({ symbol: config.BINANCE_INSTRUMENT, limit: 1, interval: '1m' })
      result = _implementStrategy({ sessionTransactions, currentHoldings: result.currentHoldings, historicRates, strategy, tickerData: { currentPrice: currentCandle[0].close, time: new Date(currentCandle[0].closeTime) }, wallet })
      console.log(result)
      if (result.decision.decision === 'BUY') {
        console.log('MOCK BUY')
      }
      if (result.decision.decision === 'SELL') {
        console.log('MOCK SELL')
      }
      counter = period
    }
    counter--
  }, 1000)
}

const _getHistoricRates = async ({clientMethod, strategyPreprocessing, instrument, periodTesting=false, startEnd=false}) => {
  let historicRates = { price: [], priceWithIndicators: []}
  const rates = startEnd ? await clientMethod({symbol: instrument, start: startEnd.start, end: startEnd.end, interval: '1m' }) : await clientMethod({symbol: instrument, interval: '1m'})
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
      amountAvailable = bal.free*100
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

  // const startEnd = {
  //   start: '2020-08-25T21:30:00+0000',
  //   end: '2020-08-21T00:30:00+0000'
  // }
  const strategy = { strategy: strategies.greenyNotGreedy, strategyPreprocessing: strategies.greenyPreprocessing }
  const historicRates = await _getHistoricRates({ clientMethod: binanceClient.candles, strategyPreprocessing: strategy.strategyPreprocessing, instrument: config.BINANCE_INSTRUMENT, startEnd: false, periodTesting: false})
  _feedThroughTestEnvironment({historicRates, sessionTransactions, wallet, strategy: strategy.strategy})
  // _feedThroughWebSocket({client: binanceClient, websocket, historicRates, sessionTransactions, wallet, strategy: strategies.greenyNotGreedy, instrument: config.BINANCE_INSTRUMENT})


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

// const coinbaseClient = new CoinbasePro.AuthenticatedClient(
//   config.COINBASE_API_KEY,
//   config.COINBASE_SECRET,
//   config.COINBASE_PASSPHRASE,
//   config.COINBASE_API_URI
// )

// const websocket = new CoinbasePro.WebsocketClient(
//   [config.COINBASE_INSTRUMENT],
//   config.COINBASE_WSS,
//   {
//     key: config.COINBASE_API_KEY,
//     secret: config.COINBASE_SECRET,
//     passphrase: config.COINBASE_PASSPHRASE,
//   },
//   { channels: ['ticker'] }
// )

// --------------------------
// let startDate = 26
// const testingPeriod = [
//   { start: `2020-08-${startDate-1}T17:30:00+0000` , end: `2020-08-${startDate-1}T21:30:00+0000`},
//   { start: `2020-08-${startDate-1}T21:30:00+0000` , end: `2020-08-${startDate}T00:30:00+0000`},
//   { start: `2020-08-${startDate}T00:30:00+0000` , end: `2020-08-${startDate}T04:30:00+0000`},
//   { start: `2020-08-${startDate}T04:30:00+0000` , end: `2020-08-${startDate}T08:30:00+0000`},
  // { start: `2020-08-${startDate}T12:00:00+0000` , end: `2020-08-${startDate}T16:00:00+0000`},
  // { start: `2020-08-${startDate}T16:00:00+0000` , end: `2020-08-${startDate}T20:00:00+0000`},
  // { start: `2020-08-${startDate}T20:00:00+0000` , end: `2020-08-${startDate+1}T00:00:00+0000`},

  // { start: `2020-08-${startDate+1}T00:00:00+0000` , end: `2020-08-${startDate+1}T04:00:00+0000`},
  // { start: `2020-08-${startDate+1}T04:00:00+0000` , end: `2020-08-${startDate+1}T08:00:00+0000`},
  // { start: `2020-08-${startDate+1}T08:00:00+0000` , end: `2020-08-${startDate+1}T12:00:00+0000`},
  // { start: `2020-08-${startDate+1}T12:00:00+0000` , end: `2020-08-${startDate+1}T16:00:00+0000`},
  // { start: `2020-08-${startDate+1}T16:00:00+0000` , end: `2020-08-${startDate+1}T20:00:00+0000`},
  // { start: `2020-08-${startDate+1}T20:00:00+0000` , end: `2020-08-${startDate+2}T00:00:00+0000`},
  //
  // { start: `2020-08-${startDate+2}T00:00:00+0000` , end: `2020-08-${startDate+2}T04:00:00+0000`},
  // { start: `2020-08-${startDate+2}T04:00:00+0000` , end: `2020-08-${startDate+2}T08:00:00+0000`},
  // { start: `2020-08-${startDate+2}T08:00:00+0000` , end: `2020-08-${startDate+2}T12:00:00+0000`},
  // { start: `2020-08-${startDate+2}T12:00:00+0000` , end: `2020-08-${startDate+2}T16:00:00+0000`},
  // { start: `2020-08-${startDate+2}T16:00:00+0000` , end: `2020-08-${startDate+2}T20:00:00+0000`},
  // { start: `2020-08-${startDate+2}T20:00:00+0000` , end: `2020-08-${startDate+3}T00:00:00+0000`},
  //
  // { start: `2020-08-${startDate+3}T00:00:00+0000` , end: `2020-08-${startDate+3}T04:00:00+0000`},
  // { start: `2020-08-${startDate+3}T04:00:00+0000` , end: `2020-08-${startDate+3}T08:00:00+0000`},
  // { start: `2020-08-${startDate+3}T08:00:00+0000` , end: `2020-08-${startDate+3}T12:00:00+0000`},
  // { start: `2020-08-${startDate+3}T12:00:00+0000` , end: `2020-08-${startDate+3}T16:00:00+0000`},
  // { start: `2020-08-${startDate+3}T16:00:00+0000` , end: `2020-08-${startDate+3}T20:00:00+0000`},
  // { start: `2020-08-${startDate+3}T20:00:00+0000` , end: `2020-08-${startDate+4}T00:00:00+0000`},
  //
  // { start: `2020-08-${startDate+4}T00:00:00+0000` , end: `2020-08-${startDate+4}T04:00:00+0000`},
  // { start: `2020-08-${startDate+4}T04:00:00+0000` , end: `2020-08-${startDate+4}T08:00:00+0000`},
  // { start: `2020-08-${startDate+4}T08:00:00+0000` , end: `2020-08-${startDate+4}T12:00:00+0000`},
  // { start: `2020-08-${startDate+4}T12:00:00+0000` , end: `2020-08-${startDate+4}T16:00:00+0000`},
  // { start: `2020-08-${startDate+4}T16:00:00+0000` , end: `2020-08-${startDate+4}T20:00:00+0000`},
  // { start: `2020-08-${startDate+4}T20:00:00+0000` , end: `2020-08-${startDate+5}T00:00:00+0000`},
// ]
// let counter = 0
// let historicRates = { price: [], priceWithIndicators: []}
// const testEnv = setInterval(async ()=> {
//   if (counter < testingPeriod.length) {
//     console.log('@@@@ BUILDING DATASET...... @@@@')
//     console.log(testingPeriod[counter])
//     console.log(historicRates.priceWithIndicators.length)
//     historicRates = await _getHistoricRates({ client: coinbaseClient, strategyPreprocessing: strategies.greenyPreprocessing, startEnd: testingPeriod[counter], instrument: config.COINBASE_INSTRUMENT, periodTesting: historicRates})
//     counter++
//   } else {
//     console.log('clearing...')
//     clearInterval(testEnv)
//     console.log('cleared')
//     _feedThroughTestEnvironment({historicRates, sessionTransactions, wallet, strategy: strategies.greenyNotGreedy})
//   }
// }, 1500)

// --------------------------

// if (periodTesting) {
//   const rates = await client.getProductHistoricRates(instrument, options)
//   const tempPrice = []
//   const tempPriceWithIndicators = []
//   for (const candle of rates) {
//     tempPrice.unshift(candle[4])
//     tempPriceWithIndicators.unshift({ price: candle[4], time: candle[0]})
//   }
//   const mergedPrice = periodTesting.price.concat(tempPrice)
//   const mergedPriceWithIndicators = periodTesting.priceWithIndicators.concat(tempPriceWithIndicators)
//   periodTesting.price = mergedPrice
//   periodTesting.priceWithIndicators = mergedPriceWithIndicators
//
//   console.log(periodTesting.priceWithIndicators[0])
//   console.log('@@ COMPLETED @@')
//   console.log(periodTesting.priceWithIndicators[periodTesting.priceWithIndicators.length -1])
//
//   if (periodTesting.priceWithIndicators.length > 300) {
//     console.log('@@@ STARTING GREENY PREPROCESSING @@@')
//     console.log(periodTesting.priceWithIndicators.length)
//     data = strategyPreprocessing(periodTesting)
//     console.log(data.priceWithIndicators[0])
//     console.log(data.priceWithIndicators[data.priceWithIndicators.length - 1])
//     return data
//   }
//   return periodTesting
// }


(async ()=> { main() })()
