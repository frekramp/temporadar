import { createPublicClient, http, parseAbiItem } from 'viem'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fqaqekjtdcnjuuszqtgk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxYXFla2p0ZGNuanV1c3pxdGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzEwMjQsImV4cCI6MjA4OTk0NzAyNH0.xIYlZD_Vp3ah2jaiyusemXuqkFyX9OEvUEULVwNj880'
)

const client = createPublicClient({
  transport: http('https://rpc.tempo.xyz'),
})

const POOL_ADDRESS = '0x88EfeFddEb6925B53a8D959dad64D952D2045779'

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
)

let lastBlock = null

async function processLog(log) {
  const { sender, amount0In, amount1In, amount0Out, amount1Out, to } = log.args

  const timecoinIn = Number(amount0In) / 1e6
  const usdcIn = Number(amount1In) / 1e6
  const timecoinOut = Number(amount0Out) / 1e6
  const usdcOut = Number(amount1Out) / 1e6

  let price = 0, amountIn = 0, amountOut = 0, tokenIn = '', tokenOut = ''

  if (timecoinIn > 0) {
    price = usdcOut / timecoinIn
    amountIn = timecoinIn
    amountOut = usdcOut
    tokenIn = 'TIMECOIN'
    tokenOut = 'USDC'
  } else {
    price = usdcIn / timecoinOut
    amountIn = usdcIn
    amountOut = timecoinOut
    tokenIn = 'USDC'
    tokenOut = 'TIMECOIN'
  }

  if (price === 0 || price > 1) return

  // Get real trader from transaction
  let trader = to || sender
  try {
    const tx = await client.getTransaction({ hash: log.transactionHash })
    trader = tx.from
  } catch (e) {}

  const block = await client.getBlock({ blockNumber: log.blockNumber })
  const timestamp = new Date(Number(block.timestamp) * 1000).toISOString()

  // Check for duplicate
  const { data: existing } = await supabase
    .from('swaps')
    .select('id')
    .eq('tx_hash', log.transactionHash)
    .limit(1)

  if (existing && existing.length > 0) return

  const { error } = await supabase.from('swaps').insert({
    block_number: Number(log.blockNumber),
    tx_hash: log.transactionHash,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    amount_out: amountOut,
    price: price,
    trader: trader,
    timestamp: timestamp,
  })

  if (!error) console.log(`✅ ${tokenIn} → ${tokenOut} | $${price.toFixed(8)} | trader: ${trader}`)
}

async function poll() {
  try {
    const latestBlock = await client.getBlockNumber()

    if (!lastBlock) {
      lastBlock = latestBlock - 10n
    }

    if (latestBlock <= lastBlock) return

    const logs = await client.getLogs({
      address: POOL_ADDRESS,
      event: SWAP_EVENT,
      fromBlock: lastBlock + 1n,
      toBlock: latestBlock,
    })

    for (const log of logs) {
      await processLog(log)
    }

    lastBlock = latestBlock
  } catch (err) {
    console.log(`⚠️ Poll error: ${err.message}`)
  }
}

async function start() {
  console.log('⚡ Temporadar indexer started (polling mode)...')
  const block = await client.getBlockNumber()
  console.log(`✅ Connected — block: ${block}`)

  // Poll every 10 seconds
  setInterval(poll, 10000)
  poll()
}

start()
