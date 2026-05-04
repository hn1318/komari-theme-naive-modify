<script setup lang="ts">

import * as echarts from 'echarts'
import { onBeforeUnmount,onMounted, ref } from 'vue'
import { useNodesStore } from '@/stores/nodes'

// Register world map (echarts provides a built‑in map if the geoJSON is loaded via CDN).
// For simplicity we assume the map data is available in the runtime.

const chartDiv = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

const nodesStore = useNodesStore()

async function initChart() {
  // Load world map geoJSON and register it with ECharts
  try {
    const response = await fetch('https://geojson-maps.ash.ms/world.json')
    const worldGeo = await response.json()
    echarts.registerMap('world', worldGeo)
  } catch (e) {
    console.error('Failed to load world map data:', e)
  }
  if (!chartDiv.value) return
  chart = echarts.init(chartDiv.value)

  const data = nodesStore.nodes.map(node => {
    // Assume node.region is a country code like "CN" or a full name.
    // Use value 1 for online, 0 for offline.
    return {
      name: node.region,
      value: node.online ? 1 : 0,
    }
  })

  const option = {
    tooltip: { trigger: 'item' },
    visualMap: {
      min: 0,
      max: 1,
      left: 'right',
      top: 'bottom',
      calculable: true,
      inRange: { color: ['#e0e0e0', '#ff7f50'] },
    },
    series: [
      {
        type: 'map',
        map: 'world', // world map name
        roam: true,
        emphasis: { label: { show: true } },
        data,
        // Show online nodes in red, offline in gray via visualMap.
      },
    ],
  }

  chart.setOption(option)
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', () => chart?.resize())
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', () => chart?.resize())
  chart?.dispose()
})
</script>

<template>
  <div ref="chartDiv" class="world-map" style="height: 600px; width: 100%;"></div>
</template>

<style scoped>
.world-map {
  max-width: 100%;
}
</style>
