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
const CHUNK_SIZE = 2000n

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
)

async function backfill() {
  // Get last saved block
  const { data } = await supabase
    .from('swaps')
    .select('block_number')
    .order('block_number', { ascending: false })
    .limit(1)

  const lastBlock = BigInt(data[0].block_number)
  const latestBlock = await client.getBlockNumber()

  console.log(`⚡ Filling gap: ${lastBlock} → ${latestBlock}`)

  let totalSaved = 0
  let fromBlock = lastBlock + 1n

  while (fromBlock < latestBlock) {
    const toBlock = fromBlock + CHUNK_SIZE > latestBlock ? latestBlock : fromBlock + CHUNK_SIZE
    process.stdout.write(`\r🔍 Scanning ${fromBlock} → ${toBlock}...`)

    try {
      const logs = await client.getLogs({
        address: POOL_ADDRESS,
        event: SWAP_EVENT,
        fromBlock,
        toBlock,
      })

      for (const log of logs) {
        const { sender, amount0In, amount1In, amount0Out, amount1Out } = log.args

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

        if (price === 0 || price > 1) continue

        const block = await client.getBlock({ blockNumber: log.blockNumber })
        const timestamp = new Date(Number(block.timestamp) * 1000).toISOString()

        const { error } = await supabase.from('swaps').insert({
          block_number: Number(log.blockNumber),
          tx_hash: log.transactionHash,
          token_in: tokenIn,
          token_out: tokenOut,
          amount_in: amountIn,
          amount_out: amountOut,
          price: price,
          trader: sender,
          timestamp: timestamp,
        })

        if (!error) {
          totalSaved++
          console.log(`\n✅ #${totalSaved} | ${tokenIn} → ${tokenOut} | $${price.toFixed(8)} | ${timestamp}`)
        }
      }
    } catch (err) {
      console.log(`\n⚠️ Skipping: ${err.message}`)
    }

    fromBlock = toBlock + 1n
  }

  console.log(`\n\n🎉 Done! ${totalSaved} new swaps saved`)
}

backfill()
