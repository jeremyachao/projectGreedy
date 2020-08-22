const CoinbasePro = require('coinbase-pro')
const config = require('./config')
const strategies = require('./strategies')
const indicators = require('technicalindicators')
const plotly = require('plotly')(config.PLOTLY_USERNAME, config.PLOTLY_API_KEY)
const fs = require('fs');

/*
  Current issues:
  - get historical prices only updates once every 5 mins, so u cant spam restart the app
  - not sure why MACD is not the same as trading view MACD
  - not sure if i should calculate indicators on current price or price one minute ago
*/

/*
  @TODO: create test environment with preset data
*/

const _getHistoricRates = async (client) => {
  // [
  //  0: oldest,
  //  length-1: newest
  //]
  let historicRates = { price: [], time: [], priceWithIndicators: []}
  let maxPeriods = 250

  //  [ time, low, high, open, close, volume ],
  // only updates every 5 mins
  const rates = await client.getProductHistoricRates(
    config.INSTRUMENT,
    { start: '2020-08-21T21:00:00+0100', end:'2020-08-22T01:00:00+0100' , granularity: 60 }
  )

  //{ start: '2020-08-21T21:00:00+0100', end:'2020-08-22T01:00:00+0100' , granularity: 60 }

  let mapCounter = 0
  // TODO: clean this up, no need time and maybe no need to declare indicators here
  for (const candle of rates) {
    if (mapCounter <= maxPeriods) {
      d = new Date(candle[0] * 1000)
      historicRates.price.unshift(candle[4])
      historicRates.time.unshift(d)
      historicRates.priceWithIndicators.unshift({ price: candle[4], time: candle[0]})
      mapCounter++
    }
  }
  return historicRates
}

const _executeBuy = (currentPrice) => {
  return { time: Date.now(), msg: 'BOUGHT AT: ' + currentPrice, price: currentPrice, action: 'BUY'}
}

const _executeSell = (currentPrice, profitLoss) => {
  return { time: Date.now(), msg: 'SOLD AT: ' + currentPrice, price: currentPrice, profitLoss: profitLoss, action: 'SELL'}
}

const _executeHold = (currentPrice) => {
  return 'HOLDING AT: ' + currentPrice
}

const _noCurrentTransactions = () => {
  return 'No current transactions'
}

const _executeStrategy = (data) => {
  // executed every time elapsed interval
  const strategy = strategies.greenyNotGreedy(data)

  const _signalStates = ({currentPrice, decision, profitLoss}) => {
    const states = {
      'BUY': _executeBuy(currentPrice),
      'SELL': _executeSell(currentPrice, profitLoss),
      'HOLD': _executeHold(currentPrice),
      'NONE': _noCurrentTransactions(),
    }
    return states[decision]
  }

  return _signalStates(strategy)
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

// @TODO: implement get any active holdings from coinbase
// @TODO: use actual ask and bid to calculate profits
const _feedThroughWebSocket = async ({websocket, historicRates, client, sessionTransactions, testMode}) => {
  let currentAsk
  let currentBid
  let currentPrice = 0
  let previousPrice = currentPrice
  let minute = 3
  let lastStatus = 'None'
  let values = historicRates.price
  let currentHoldings = 0

  let greenyIndicators = _calculateIndicators(values)
  let ema50 = greenyIndicators.ema50
  let rsi = greenyIndicators.rsi
  let macd = greenyIndicators.macd

  let macdTrend = parseFloat(macd[macd.length -1].MACD) > parseFloat(macd[macd.length -1].signal) ? 'Uptrend' : 'Downtrend'

  const appendedRates = _appendIndicatorValuesToList({ list: historicRates.priceWithIndicators, ema50, rsi, macd})
  historicRates.priceWithIndicators = appendedRates

  let counter = minute

  if (testMode) {
    console.log('------testMode-----')
    const testFeedSpeed = 10
    let testHistoricPriceIndicator= historicRates.priceWithIndicators.slice(0, 60)
    let testHistoricPrice = historicRates.price.slice(0,60)
    let testHistoricRates = { price: testHistoricPrice, priceWithIndicators: testHistoricPriceIndicator}
    let testFeed = historicRates.priceWithIndicators.slice(60, historicRates.length)
    let testCurrentPrice = 0
    let testCounter = 0
    let testcurrentHoldings = 0
    let testlastStatus = 'NONE'

    let cEpochTime = testHistoricPriceIndicator[0].time
    let d = new Date(cEpochTime * 1000)
    console.log('TIME FRAME START: ' + d)
    let interval = setInterval(async ()=>{
      if (testCounter < testFeed.length) {
        // NOTE: real version uses counter to countdown and THEN execute strategy
        testCurrentPrice = testFeed[testCounter].price
        testCurrentTime = testFeed[testCounter].time
        testCounter++
        // test logic ------------------------------------------------------------
        // NOTE: this is different size from real historicRates 60 in test mode 250 in real
        testHistoricRates.price.push(testCurrentPrice)
        testHistoricRates.price.shift()

        // indicators
        greenyIndicators = _calculateIndicators(testHistoricRates.price)
        ema50 = greenyIndicators.ema50
        rsi = greenyIndicators.rsi
        macd = greenyIndicators.macd

        testHistoricRates.priceWithIndicators.push({ price: testCurrentPrice, time: new Date(testCurrentTime * 1000), rsi: rsi[rsi.length-1], macd: macd[macd.length -1], ema50: ema50[ema50.length -1] })
        testHistoricRates.priceWithIndicators.shift()

        // Strategy
        const execution = await _executeStrategy({client, historicRates: testHistoricRates, currentHoldings: testcurrentHoldings})
        testlastStatus = execution
        if (testlastStatus.action === 'BUY' || testlastStatus.action === 'SELL') {
          sessionTransactions.push(testlastStatus)
          if (testlastStatus.action === 'BUY') {
            testcurrentHoldings = testlastStatus
          }
          if (testlastStatus.action === 'SELL') {
            testcurrentHoldings = 0
          }
        }
        console.log(execution)
        //test logic end ------------------------------------------------------------

      } else {

        let totalBuy = 0
        let totalSell = 0
        let averagePL = 0
        let sellCount = 0
        for (const transaction of sessionTransactions) {
          if (transaction.action === 'BUY') {
            totalBuy += transaction.price
          }
          if (transaction.action === 'SELL') {
            averagePL += transaction.profitLoss
            sellCount++
            totalSell += transaction.price
          }
        }
        let profitLoss = totalSell - totalBuy
        console.log('-------FINISHED FEED-----')
        console.log('----------------------------------------------')
        console.log('***TRANSACTIONS****')
        console.log(sessionTransactions)
        console.log('***NET PROFIT/LOSS****')
        console.log('PROFIT/LOSS: ' + profitLoss)
        console.log('AVERAGE P/L PER TRADE: ' + averagePL/sellCount)

        clearInterval(interval)
      }
    }, testFeedSpeed)

  } else {
    websocket.on('message', async (data) => {
    /* work with data */
    if (data.type === 'heartbeat') {
      let aboveEma = currentPrice > ema50[ema50.length - 1]
      counter--
      // Every second
      // console.log('^^^')
      // console.log('time: ' + Date.now())
      // console.log('50: ' + ema50[ema50.length - 1])
      // console.log('RSI: ' + rsi[rsi.length -1])
      // console.log('MACD: ' + macd[macd.length -1].MACD)
      // console.log('Signal: ' + macd[macd.length -1].signal)
      // console.log('Trend: ' + macdTrend)
      // console.log('price: ' + currentPrice)
      // console.log('counter: ' + counter)
      // console.log('above ema: ' + aboveEma)
      // console.log('Last status: ' + lastStatus)
      // console.log('vvv')
    }
    if (data.type ==='ticker'){
      // Real time
      currentAsk = parseFloat(data.best_ask)
      currentBid = parseFloat(data.best_bid)
      previousPrice = currentPrice
      currentPrice = parseFloat(data.price)
    }
    if (counter === 0) {
      counter = minute
      historicRates.price.push(currentPrice)
      historicRates.price.shift()

      // indicators
      greenyIndicators = _calculateIndicators(values)
      ema50 = greenyIndicators.ema50
      rsi = greenyIndicators.rsi
      macd = greenyIndicators.macd
      macdTrend = parseFloat(macd[macd.length -1].MACD) > parseFloat(macd[macd.length -1].signal) ? 'Uptrend' : 'Downtrend'

      historicRates.priceWithIndicators.push({ price: currentPrice, time: Date.now(), rsi: rsi[rsi.length-1], macd: macd[macd.length -1], ema50: ema50[ema50.length -1] })
      historicRates.priceWithIndicators.shift()

      // Strategy
      const execution = _executeStrategy({client, historicRates, currentHoldings})
      lastStatus = execution
      if (lastStatus.action === 'BUY' || lastStatus.action === 'SELL') {
        sessionTransactions.push(lastStatus)
        if (lastStatus.action === 'BUY') {
          currentHoldings = lastStatus
        }
        if (lastStatus.action === 'SELL') {
          currentHoldings = false
        }
      }
      console.log(execution)
    }
    })
    websocket.on('error', err => {
      /* handle error */
    })
    websocket.on('close', () => {
      /* ... */
    })
  }

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
  console.log('****************************************')

  let historicRates = await _getHistoricRates(client)

  let sessionTransactions = []

  let testMode = true

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


  await _feedThroughWebSocket({websocket, historicRates, client, sessionTransactions, testMode})

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
    //graceful shutdown
    // let totalBuy = 0
    // let totalSell = 0
    // for (const transaction of sessionTransactions) {
    //   if (transaction.action === 'BUY') {
    //     totalBuy += transaction.price
    //   }
    //   if (transaction.action === 'SELL') {
    //     totalSell += transaction.price
    //   }
    // }
    // let profitLoss = totalSell - totalBuy
    // console.log('----------------------------------------------')
    // console.log('***TRANSACTIONS****')
    // console.log(sessionTransactions)
    // console.log('***NET PROFIT/LOSS****')
    // console.log('PROFIT/LOSS: ' + profitLoss)
    fs.unlinkSync('./greenyLogFile')
    process.exit();
  });

}


(async ()=> { main() })()
