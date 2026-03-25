import { supabase } from './supabase'

export async function fetchAllSwaps() {
  let allData = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('swaps')
      .select('*')
      .gt('price', 0)
      .lt('price', 1)
      .lt('amount_in', 10000)
      .order('timestamp', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error || !data || data.length === 0) break
    allData = [...allData, ...data]
    if (data.length < pageSize) break
    page++
  }

  return allData
}
