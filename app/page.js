'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const PAIRS = [
  { label: 'TIMECOIN/USDC', value: 'TIMECOIN/USDC', color: '#00ff88' },
  { label: 'ENSH/USDC', value: 'ENSH/USDC', color: '#a78bfa' },
]

async function fetchSwapsForPair(pair) {
  let allData = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('swaps')
      .select('*')
      .eq('pair', pair)
      .gt('price', 0)
      .lt('price', 100)
      .order('timestamp', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error || !data || data.length === 0) break
    allData = [...allData, ...data]
    if (data.length < pageSize) break
    page++
  }

  return allData
}

export default function Home() {
  const chartRef = useRef(null)
  const [swaps, setSwaps] = useState([])
  const [stats, setStats] = useState({ volume24h: 0, totalVolume: 0, trades24h: 0, price: 0, change: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedPair, setSelectedPair] = useState('TIMECOIN/USDC')
  const allSwapsRef = useRef([])

  const chartInstanceRef = useRef(null)

  async function renderChart(data) {
    const { createChart, CandlestickSeries } = await import('lightweight-charts')
    if (!chartRef.current) return
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove()
      chartInstanceRef.current = null
    }
    chartRef.current.innerHTML = ''

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: window.innerWidth < 768 ? 280 : 420,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#555',
      },
      grid: {
        vertLines: { color: '#111' },
        horzLines: { color: '#111' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#1a1a1a',
      },
      rightPriceScale: {
        borderColor: '#1a1a1a',
        autoScale: true,
        scaleMargins: { top: 0.15, bottom: 0.15 },
        minimumWidth: window.innerWidth < 768 ? 60 : 100,
      },
      localization: {
        priceFormatter: (p) => '$' + Number(p).toFixed(8),
      },
      crosshair: { mode: 1 },
    })

    const pairColor = PAIRS.find(p => p.value === selectedPair)?.color || '#00ff88'

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: pairColor,
      downColor: '#ff3b3b',
      borderUpColor: pairColor,
      borderDownColor: '#ff3b3b',
      wickUpColor: pairColor,
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

  async function loadData(pair) {
    setLoading(true)
    const data = await fetchSwapsForPair(pair)
    if (!data || data.length === 0) {
      setLoading(false)
      setSwaps([])
      return
    }
    allSwapsRef.current = data
    setLoading(false)
    setSwaps(data)

    const now = Date.now()
    const last24h = data.filter(s => new Date(s.timestamp).getTime() >= now - 86400000)
    const latestPrice = Number(data[data.length - 1]?.price || 0)
    const firstPrice24h = last24h.length > 0 ? Number(last24h[0]?.price || 0) : latestPrice
    const change = firstPrice24h > 0 ? ((latestPrice - firstPrice24h) / firstPrice24h * 100).toFixed(2) : 0
    const volume24h = last24h.filter(s => s.token_in === 'USDC').reduce((sum, s) => sum + Number(s.amount_in), 0) + last24h.filter(s => s.token_in !== 'USDC').reduce((sum, s) => sum + Number(s.amount_out), 0)
    const totalVolume = data.filter(s => s.token_in === 'USDC').reduce((sum, s) => sum + Number(s.amount_in), 0) + data.filter(s => s.token_in !== 'USDC').reduce((sum, s) => sum + Number(s.amount_out), 0)

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
    loadData(selectedPair)
    const interval = setInterval(() => loadData(selectedPair), 30000)
    return () => clearInterval(interval)
  }, [selectedPair])

  const isPositive = Number(stats.change) >= 0
  const pairColor = PAIRS.find(p => p.value === selectedPair)?.color || '#00ff88'

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">

      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">Temporadar</span>
          <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
        </div>
        <a href="https://x.com/frekramp" target="_blank" className="text-xs text-gray-500 hover:text-green-400 transition-colors">Built by @frekramp</a>
      </nav>

      {/* Pair Selector */}
      <div className="border-b border-[#1a1a1a] px-4 py-2 flex gap-2 overflow-x-auto">
        {PAIRS.map((pair) => (
          <button
            key={pair.value}
            onClick={() => setSelectedPair(pair.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              selectedPair === pair.value
                ? 'text-black font-bold'
                : 'bg-[#111] text-gray-400 hover:text-white'
            }`}
            style={selectedPair === pair.value ? { backgroundColor: pair.color } : {}}
          >
            {pair.label}
          </button>
        ))}
      </div>

      {/* Price */}
      <div className="px-4 py-4 border-b border-[#1a1a1a]">
        <div className="text-xs text-gray-500 mb-1">{selectedPair} · Tempo Chain</div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-2xl font-bold">${stats.price}</span>
          <span className={`text-sm font-medium px-1.5 py-0.5 rounded ${isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(stats.change)}% 24h
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#111] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-1">24h Vol</p>
            <p className="text-white text-sm font-medium">${Number(stats.volume24h).toLocaleString()}</p>
          </div>
          <div className="bg-[#111] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-1">Total Vol</p>
            <p className="text-white text-sm font-medium">${Number(stats.totalVolume).toLocaleString()}</p>
          </div>
          <div className="bg-[#111] rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-1">24h Trades</p>
            <p className="text-white text-sm font-medium">{stats.trades24h}</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="border-b border-[#1a1a1a]">
        {loading ? (
          <div className="h-[280px] md:h-[420px] flex flex-col items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: pairColor, borderTopColor: 'transparent' }}></div>
            <span className="text-gray-600 text-xs">Loading {selectedPair} chart...</span>
          </div>
        ) : swaps.length === 0 ? (
          <div className="h-[280px] md:h-[420px] flex flex-col items-center justify-center gap-3">
            <span className="text-gray-600 text-sm">No data yet for {selectedPair}</span>
            <span className="text-gray-700 text-xs">Backfill in progress...</span>
          </div>
        ) : (
          <div ref={chartRef} className="w-full" />
        )}
      </div>

      {/* Recent Trades */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-300">Recent Trades</h2>
          <span className="text-xs text-gray-600">{swaps.length} total</span>
        </div>

        <div className="space-y-2">
          {[...swaps].reverse().slice(0, 50).map((swap) => (
            <div key={swap.id} className="flex items-center justify-between bg-[#111] rounded-lg px-3 py-2.5 hover:bg-[#161616] transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-bold shrink-0 ${swap.token_in === 'USDC' ? 'text-green-400' : 'text-red-400'}`}>
                  {swap.token_in === 'USDC' ? '▲' : '▼'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-white truncate">
                    {Number(swap.amount_in).toLocaleString(undefined, { maximumFractionDigits: 2 })} {swap.token_in}
                    <span className="text-gray-500"> → </span>
                    {Number(swap.amount_out).toLocaleString(undefined, { maximumFractionDigits: 2 })} {swap.token_out}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(swap.timestamp).toLocaleString()} · {swap.trader?.slice(0, 6)}...{swap.trader?.slice(-4)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-400 shrink-0 ml-2">
                ${Number(swap.price).toFixed(8)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#1a1a1a] px-4 py-3 text-center">
        <span className="text-xs text-gray-700">Temporadar — First analytics on Tempo Chain · Updates every 30s</span>
      </div>

    </main>
  )
}
