import { createPublicClient, http, parseAbiItem } from 'viem'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://fqaqekjtdcnjuuszqtgk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxYXFla2p0ZGNuanV1c3pxdGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzEwMjQsImV4cCI6MjA4OTk0NzAyNH0.xIYlZD_Vp3ah2jaiyusemXuqkFyX9OEvUEULVwNj880'
)

const client = createPublicClient({
  transport: http('https://tempo-mainnet.drpc.org'),
})

const POOL_ADDRESS = '0x88EfeFddEb6925B53a8D959dad64D952D2045779'

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
)

async function startIndexer() {
  console.log('⚡ Temporadar indexer started...')
  const blockNumber = await client.getBlockNumber()
  console.log('✅ Connected to Tempo Chain — block:', blockNumber.toString())

  client.watchContractEvent({
    address: POOL_ADDRESS,
    abi: [SWAP_EVENT],
    eventName: 'Swap',
    onLogs: async (logs) => {
      for (const log of logs) {
        const { sender, amount0In, amount1In, amount0Out, amount1Out } = log.args

        // Both 6 decimals
        // token0 = TIMECOIN, token1 = USDC.e
        const timecoinIn = Number(amount0In) / 1e6
        const usdcIn = Number(amount1In) / 1e6
        const timecoinOut = Number(amount0Out) / 1e6
        const usdcOut = Number(amount1Out) / 1e6

        // Log raw to debug
        console.log('RAW:', { timecoinIn, usdcIn, timecoinOut, usdcOut })

        let price = 0
        let amountIn = 0
        let amountOut = 0
        let tokenIn = ''
        let tokenOut = ''

        if (timecoinIn > 0) {
          // Selling TIMECOIN for USDC
          price = usdcOut / timecoinIn
          amountIn = timecoinIn
          amountOut = usdcOut
          tokenIn = 'TIMECOIN'
          tokenOut = 'USDC'
        } else {
          // Buying TIMECOIN with USDC
          price = usdcIn / timecoinOut
          amountIn = usdcIn
          amountOut = timecoinOut
          tokenIn = 'USDC'
          tokenOut = 'TIMECOIN'
        }

        console.log(`🔄 ${tokenIn} → ${tokenOut} | Price: $${price.toFixed(8)} | Amount: ${amountIn}`)

        const { error } = await supabase.from('swaps').insert({
          block_number: Number(log.blockNumber),
          tx_hash: log.transactionHash,
          token_in: tokenIn,
          token_out: tokenOut,
          amount_in: amountIn,
          amount_out: amountOut,
          price: price,
          trader: sender,
          timestamp: new Date().toISOString(),
        })

        if (error) console.error('❌ DB error:', error)
        else console.log('✅ Swap saved!')
      }
    },
    onError: (err) => console.error('❌ RPC error:', err),
  })
}

startIndexer()
