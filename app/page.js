'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchAllSwaps } from '../lib/fetchSwaps'

export default function Home() {
  const chartRef = useRef(null)
  const [swaps, setSwaps] = useState([])
  const [stats, setStats] = useState({ volume24h: 0, totalVolume: 0, trades24h: 0, price: 0, change: 0 })
  const [loading, setLoading] = useState(true)
  const allSwapsRef = useRef([])

  async function renderChart(data) {
    const { createChart, CandlestickSeries } = await import('lightweight-charts')
    if (!chartRef.current) return
    chartRef.current.innerHTML = ''

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 450,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#111111' },
        horzLines: { color: '#111111' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#222222',
      },
      rightPriceScale: {
        borderColor: '#222222',
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        minimumWidth: 80,
      },
      localization: {
        priceFormatter: (p) => '$' + Number(p).toFixed(8),
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff88',
      downColor: '#ff3b3b',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3b3b',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3b3b',
      priceFormat: {
        type: 'price',
        precision: 8,
        minMove: 0.00000001,
      },
    })

    const interval = 3600
    const buckets = {}
    data.forEach((swap) => {
      const time = Math.floor(new Date(swap.timestamp).getTime() / 1000 / interval) * interval
      const p = Number(swap.price)
      if (!buckets[time]) {
        buckets[time] = { time, open: p, high: p, low: p, close: p }
      } else {
        buckets[time].high = Math.max(buckets[time].high, p)
        buckets[time].low = Math.min(buckets[time].low, p)
        buckets[time].close = p
      }
    })

    const candles = Object.values(buckets).sort((a, b) => a.time - b.time)
    candleSeries.setData(candles)
    chart.timeScale().fitContent()
  }

  async function loadData() {
    const data = await fetchAllSwaps()
    if (!data || data.length === 0) return
    allSwapsRef.current = data
    setLoading(false)
    setSwaps(data)

    const now = Date.now()
    const last24h = data.filter(s => new Date(s.timestamp).getTime() >= now - 86400000)
    const latestPrice = Number(data[data.length - 1]?.price || 0)
    const firstPrice24h = last24h.length > 0 ? Number(last24h[0]?.price || 0) : latestPrice
    const change = firstPrice24h > 0 ? ((latestPrice - firstPrice24h) / firstPrice24h * 100).toFixed(2) : 0
    const volume24h = last24h.reduce((sum, s) => sum + Number(s.amount_in), 0)
    const totalVolume = data.reduce((sum, s) => sum + Number(s.amount_in), 0)

    setStats({
      volume24h: volume24h.toFixed(2),
      totalVolume: totalVolume.toFixed(2),
      trades24h: last24h.length,
      price: latestPrice.toFixed(8),
      change: change,
    })

    renderChart(data)
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  const isPositive = Number(stats.change) >= 0

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-green-400 text-xl font-bold">⚡ Temporadar</span>
          <span className="text-xs bg-green-400/10 text-green-400 px-2 py-1 rounded-full animate-pulse">LIVE</span>
        </div>
        <span className="text-xs text-gray-500">Tempo Chain Analytics — TIMECOIN/USDC</span>
      </div>

      <div className="border-b border-[#1a1a1a] px-6 py-3 flex items-center gap-8 flex-wrap">
        <div>
          <span className="text-2xl font-bold text-white">${stats.price}</span>
          <span className={`ml-2 text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(stats.change)}% 24h
          </span>
        </div>
        <div className="flex gap-8 text-sm flex-wrap">
          <div>
            <p className="text-gray-500">24h Volume</p>
            <p className="text-white font-medium">${Number(stats.volume24h).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Total Volume</p>
            <p className="text-white font-medium">${Number(stats.totalVolume).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">24h Trades</p>
            <p className="text-white font-medium">{stats.trades24h}</p>
          </div>
          <div>
            <p className="text-gray-500">Pair</p>
            <p className="text-white font-medium">TIMECOIN/USDC</p>
          </div>
          <div>
            <p className="text-gray-500">Chain</p>
            <p className="text-green-400 font-medium">Tempo</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-[#1a1a1a]">
        {loading ? (
          <div className="h-[450px] flex items-center justify-center text-gray-500">
            Loading chart...
          </div>
        ) : (
          <div ref={chartRef} className="w-full rounded-lg overflow-hidden" />
        )}
      </div>

      <div className="px-6 py-4">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Recent Trades</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-[#1a1a1a]">
              <th className="text-left py-2 font-normal">Time</th>
              <th className="text-left py-2 font-normal">Type</th>
              <th className="text-left py-2 font-normal">Amount</th>
              <th className="text-left py-2 font-normal">Price</th>
              <th className="text-left py-2 font-normal">Trader</th>
            </tr>
          </thead>
          <tbody>
            {swaps.slice(-30).reverse().map((swap) => (
              <tr key={swap.id} className="border-b border-[#111111] hover:bg-[#111111] transition-colors">
                <td className="py-2 text-gray-500">{new Date(swap.timestamp).toLocaleString()}</td>
                <td className={`py-2 font-bold ${swap.token_in === 'USDC' ? 'text-green-400' : 'text-red-400'}`}>
                  {swap.token_in === 'USDC' ? '▲ BUY' : '▼ SELL'}
                </td>
                <td className="py-2 text-white">
                  {Number(swap.amount_in).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  <span className="text-gray-500 ml-1">{swap.token_in}</span>
                </td>
                <td className="py-2 text-white">${Number(swap.price).toFixed(8)}</td>
                <td className="py-2 text-gray-500 font-mono">
                  {swap.trader?.slice(0, 6)}...{swap.trader?.slice(-4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
