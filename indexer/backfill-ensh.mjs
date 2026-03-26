import { createPublicClient, http, parseAbiItem } from 'viem'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fqaqekjtdcnjuuszqtgk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxYXFla2p0ZGNuanV1c3pxdGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzEwMjQsImV4cCI6MjA4OTk0NzAyNH0.xIYlZD_Vp3ah2jaiyusemXuqkFyX9OEvUEULVwNj880'
)

const client = createPublicClient({
  transport: http('https://rpc.tempo.xyz'),
})

const POOL_ADDRESS = '0x057ef5d29a591cfa467aabcd62ee86c1a4336dbf'
const CHUNK_SIZE = 2000n

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
)

// First delete wrong ENSH data
async function cleanup() {
  await supabase.from('swaps').delete().eq('pair', 'ENSH/USDC')
  console.log('🧹 Cleaned old ENSH data')
}

async function backfill() {
  await cleanup()

  const latestBlock = await client.getBlockNumber()
  const START_BLOCK = 10297353n
  console.log(`⚡ Backfilling ENSH/USDC from ${START_BLOCK} → ${latestBlock}`)

  let totalSaved = 0
  let fromBlock = START_BLOCK

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
        const { sender, amount0In, amount1In, amount0Out, amount1Out, to } = log.args

        // USDC is token0, ENSH is token1 (quoteToken=token1 means token1 is quote=USDC... wait)
        // defined.fi says quoteToken=token1, so token1=USDC, token0=ENSH
        // Let's use: token0=ENSH, token1=USDC
        const enshIn = Number(amount0In) / 1e6
        const usdcIn = Number(amount1In) / 1e6
        const enshOut = Number(amount0Out) / 1e6
        const usdcOut = Number(amount1Out) / 1e6

        let price = 0, amountIn = 0, amountOut = 0, tokenIn = '', tokenOut = ''

        if (enshIn > 0) {
          // Selling ENSH for USDC
          price = usdcOut / enshIn
          amountIn = enshIn
          amountOut = usdcOut
          tokenIn = 'ENSH'
          tokenOut = 'USDC'
        } else {
          // Buying ENSH with USDC
          price = usdcIn / enshOut
          amountIn = usdcIn
          amountOut = enshOut
          tokenIn = 'USDC'
          tokenOut = 'ENSH'
        }

        if (price === 0 || price > 100) continue

        let trader = to || sender
        try {
          const tx = await client.getTransaction({ hash: log.transactionHash })
          trader = tx.from
        } catch (e) {}

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
          trader: trader,
          timestamp: timestamp,
          pair: 'ENSH/USDC',
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

  console.log(`\n🎉 ENSH backfill done! ${totalSaved} swaps saved`)
}

backfill()
