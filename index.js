const CoinbasePro = require('coinbase-pro')
const config = require('./config')
const strategies = require('./strategies')
const fs = require('fs');

/*
  Current issues:
  - get historical prices only updates once every 5 mins, so u cant spam restart the app
  - not sure why MACD is not the same as trading view MACD
  - not sure if i should calculate indicators on current price or price one minute ago
*/

// LOW PRIORITY
// @TODO: implement get any active holdings from coinbase
// @TODO: use actual ask and bid to calculate profits
// TODO: clean candle of rates loop up, no need time and maybe no need to declare indicators there


const _getHistoricRates = async (client, strategyPreprocessing, startEnd, periodTesting=false) => {


  // max 300
  let options
  //  [ time, low, high, open, close, volume ],
  // only updates every 5 mins
  if (startEnd) {
    options = { start: startEnd.start, end: startEnd.end, granularity: 60 }
  } else {
    options = { granularity: 60 }
  }

  if (periodTesting) {
    const rates = await client.getProductHistoricRates(
      config.INSTRUMENT,
      options
    )
    const tempPrice = []
    const tempPriceWithIndicators = []
    for (const candle of rates) {
      tempPrice.unshift(candle[4])
      tempPriceWithIndicators.unshift({ price: candle[4], time: candle[0]})
    }
    const mergedPrice = periodTesting.price.concat(tempPrice)
    const mergedPriceWithIndicators = periodTesting.priceWithIndicators.concat(tempPriceWithIndicators)
    periodTesting.price = mergedPrice
    periodTesting.priceWithIndicators = mergedPriceWithIndicators

    console.log(periodTesting.priceWithIndicators[0])
    console.log('@@ COMPLETED @@')
    console.log(periodTesting.priceWithIndicators[periodTesting.priceWithIndicators.length -1])

    if (periodTesting.priceWithIndicators.length > 1400) {
      console.log('@@@ STARTING GREENY PREPROCESSING @@@')
      console.log(periodTesting.priceWithIndicators.length)
      data = strategyPreprocessing(periodTesting)
      console.log(data.priceWithIndicators[0])
      console.log(data.priceWithIndicators[data.priceWithIndicators.length - 1])
      return data
    }
    return periodTesting
  }

  // [
  //  0: oldest,
  //  length-1: newest
  //]
  let historicRates = { price: [], priceWithIndicators: []}

  const rates = await client.getProductHistoricRates(
    config.INSTRUMENT,
    options
  )

  for (const candle of rates) {
    historicRates.price.unshift(candle[4])
    historicRates.priceWithIndicators.unshift({ price: candle[4], time: candle[0]})
  }

  // if present, one time data setup
  if (strategyPreprocessing) {
    data = strategyPreprocessing(historicRates)
    return data
  }

  return historicRates
}

const _displayEndMessage = (sessionTransactions) => {
  let totalBuy = 0
  let totalSell = 0
  let averagePL = 0
  let sellCount = 0
  let totalTradesCount = 0
  let goodTradesCount = 0
  let hitSLCount = 0
  const fileName = './greeny-RESULTS'

  for (const transaction of sessionTransactions) {
    fs.appendFileSync(fileName, JSON.stringify(transaction) + '\r\n')

    if (transaction.action === 'BUY') {
      totalBuy += transaction.totalValue
    }
    if (transaction.action === 'SELL') {
      totalTradesCount++
      averagePL += transaction.profitLoss
      sellCount++
      totalSell += transaction.totalValue
      if (transaction.profitLoss > 0) {
        goodTradesCount++
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
  console.log('***NET PROFIT/LOSS****')
  console.log(config.INSTRUMENT)
  console.log('PROFIT/LOSS: ' + profitLoss)
  console.log('TOTAL BOUGHT: ' + totalBuy)
  console.log('TOTAL SOLD: ' + totalSell)
  console.log('TOTAL TRADES: ' + totalTradesCount)
  console.log('AVERAGE P/L PER TRADE: ' + averagePL/sellCount)
  console.log('HIT SL %: ' + (hitSLCount/totalTradesCount*100))
  console.log('PROFITABLE TRADES %: ' + (goodTradesCount/totalTradesCount * 100))
  console.log('SAVED TO: ' + fileName)
}

const _executeBuy = (currentPrice, units, time) => {
  return { time: new Date(time), msg: 'BOUGHT ' + units +  ' UNITS AT: ' + currentPrice, price: currentPrice, action: 'BUY', totalValue: units*currentPrice, units: units}
}

const _executeSell = (currentPrice, profitLoss, units, totalValue, time, hitSL) => {
  return { time: new Date(time), msg: 'SOLD ' + units + ' UNITS AT: ' + currentPrice, price: currentPrice, profitLoss: profitLoss, action: 'SELL', totalValue: totalValue, units: units, hitSL: hitSL}
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

  const _getLastStatus = ({currentPrice, decision, profitLoss, units, totalValue, time, hitSL}) => {
    const states = {
      'BUY': _executeBuy(currentPrice, units, time),
      'SELL': _executeSell(currentPrice, profitLoss, units, totalValue, time, hitSL),
      'HOLD': _executeHold(currentPrice),
      'NONE': _noCurrentTransactions(),
    }
    return states[decision]
  }

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
  return currentHoldings
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
  let testcurrentHoldings = 0
  let testlastStatus = 'NONE'

  let interval = setInterval(()=>{
    if (testCounter < testFeed.length) {
      // NOTE: real version uses counter to countdown and THEN execute strategy
      testCurrentPrice = testFeed[testCounter].price
      testCurrentTime = testFeed[testCounter].time
      testCounter++
      let tickerData = {
        currentPrice: testCurrentPrice,
        time: testCurrentTime
      }
      // NOTE: this is different size from real historicRates 60 in test mode 250 in real
      testcurrentHoldings = _implementStrategy({ sessionTransactions, currentHoldings: testcurrentHoldings, historicRates: testHistoricRates, strategy, time: new Date(testCurrentTime * 1000), tickerData, wallet })
    } else {
      _displayEndMessage(sessionTransactions)
      clearInterval(interval)
    }
  }, testFeedSpeed)
}


const _feedThroughWebSocket = async ({websocket, historicRates, sessionTransactions, wallet, strategy}) => {
  let currentAsk
  let currentBid
  let currentPrice = 0
  let minute = 5
  let currentHoldings = 0

  let tickerData = {
    currentPrice,
    time: 0,
  }

  let counter = minute

  websocket.on('message', (data) => {
  /* work with data */

    if (data.type === 'heartbeat') {
      let aboveEma = currentPrice > ema50[ema50.length - 1]
      // Every second
      // console.log('>>>>>>>>>>>>><<<<<<<<<<<<<<<')
      // console.log('price: ' + currentPrice)
      // console.log('time: ' + new Date())
      // console.log('----------')
      // console.log('ema: ' + ema50[ema50.length - 1])
      // console.log('above ema: ' + aboveEma)
      // console.log('----------')
      // console.log('RSI: ' + rsi[rsi.length -1])
      // console.log('----------')
      // console.log('MACD: ' + macd[macd.length -1].MACD)
      // console.log('Signal: ' + macd[macd.length -1].signal)
      // console.log('Histo: ' + macd[macd.length -1].histogram)
      // console.log('----------')
      // console.log('counter: ' + counter)
      // console.log('>>>>>>>>>>>>><<<<<<<<<<<<<<<')
      console.log('.')
      counter--
    }
    if (data.type ==='ticker'){
      // Real time
      currentAsk = parseFloat(data.best_ask)
      currentBid = parseFloat(data.best_bid)
      tickerData.currentPrice = parseFloat(data.price)
      tickerData.time = new Date();
    }
    if (counter === 0) {
      counter = minute
      _implementStrategy({ sessionTransactions, currentHoldings: currentHoldings, historicRates: historicRates, strategy, tickerData, wallet })
    }
  })
  websocket.on('error', err => {
    /* handle error */
  })
  websocket.on('close', () => {
    /* ... */
  })

}

// const params = {
//   amount: '100.00',
//   currency: 'GBP',
//   coinbase_account_id: 'eafc4cb3-600c-5ba1-b9be-b693e7acce52',
// };
// await client.deposit(params);
// console.log(await client.getAccounts())
//
// console.log('****************************************')
//
// const buyParams = {
//   type: 'market',
//   side: 'buy',
//   size: '1',
//   funds: '100',
//   product_id: config.INSTRUMENT,
// };
// console.log(await client.placeOrder(buyParams))

const main = async () => {
  const client = new CoinbasePro.AuthenticatedClient(
    config.API_KEY,
    config.SECRET,
    config.PASSPHRASE,
    config.API_URI
  )
  const websocket = new CoinbasePro.WebsocketClient(
    [config.INSTRUMENT],
    config.WSS,
    {
      key: config.API_KEY,
      secret: config.SECRET,
      passphrase: config.PASSPHRASE,
    },
    { channels: ['ticker'] }
  )
  console.log('****************************************')


  const wallet = {
    amountAvailable: 10000,
  }
  const sessionTransactions = []

  // --------------------------
  let startDate = 21
  const testingPeriod = [
    { start: `2020-08-${startDate}T00:00:00+0000` , end: `2020-08-${startDate}T04:00:00+0000`},
    { start: `2020-08-${startDate}T04:00:00+0000` , end: `2020-08-${startDate}T08:00:00+0000`},
    { start: `2020-08-${startDate}T08:00:00+0000` , end: `2020-08-${startDate}T12:00:00+0000`},
    { start: `2020-08-${startDate}T12:00:00+0000` , end: `2020-08-${startDate}T16:00:00+0000`},
    { start: `2020-08-${startDate}T16:00:00+0000` , end: `2020-08-${startDate}T20:00:00+0000`},
    { start: `2020-08-${startDate}T20:00:00+0000` , end: `2020-08-${startDate+1}T00:30:00+0000`},
  ]
  let counter = 0
  let historicRates = { price: [], priceWithIndicators: []}
  const testEnv = setInterval(async ()=> {
    if (counter < testingPeriod.length) {
      console.log('@@@@ BUILDING DATASET...... @@@@')
      console.log(testingPeriod[counter])
      console.log(historicRates.priceWithIndicators.length)
      historicRates = await _getHistoricRates(client, strategies.greenyPreprocessing, testingPeriod[counter], historicRates)
      counter++
    } else {
      console.log('clearing...')
      clearInterval(testEnv)
      console.log('cleared')
      _feedThroughTestEnvironment({historicRates, sessionTransactions, wallet, strategy: strategies.greenyNotGreedy})
    }
  }, 1500)

  // --------------------------



  const startEnd = {
    start: '2020-08-23T15:00:00+0000',
    end: '2020-08-23T19:00:00+0000'
  }
  // const historicRates = await _getHistoricRates(client, strategies.greenyPreprocessing, startEnd)
  // _feedThroughTestEnvironment({historicRates, sessionTransactions, wallet, strategy: strategies.greenyNotGreedy})
  // _feedThroughWebSocket({websocket, historicRates, sessionTransactions, wallet, strategy: strategies.greenyNotGreedy})

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


(async ()=> { main() })()
