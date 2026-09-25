<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { useRouter } from 'vue-router'
import { computed } from 'vue'
import { registerMap } from 'echarts/core'
import VChart from 'vue-echarts'
import '@/utils/echarts'
import worldGeoJson from '@/assets/world.geo.json'
import { regionCoordinates } from '@/utils/regionGeo'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { useAppStore } from '@/stores/app'
import type { NodeData } from '@/stores/nodes'

const props = defineProps<{
  nodes: NodeData[]
}>()

const appStore = useAppStore()
const router = useRouter()

// 只注册一次世界地图
let mapRegistered = false
function ensureMap() {
  if (!mapRegistered) {
    registerMap('world', worldGeoJson as unknown as Parameters<typeof registerMap>[1])
    mapRegistered = true
  }
}
ensureMap()

interface MapPoint {
  name: string
  value: [number, number, number]
  code: string
  online: number
  total: number
  uuid: string
}

// 按地区聚合节点，转换为地图标记点
const points = computed<MapPoint[]>(() => {
  const byRegion = new Map<string, NodeData[]>()
  for (const node of props.nodes) {
    const code = getRegionCode(node.region)
    const coord = regionCoordinates[code]
    if (!coord)
      continue
    const list = byRegion.get(code) ?? []
    list.push(node)
    byRegion.set(code, list)
  }

  const result: MapPoint[] = []
  for (const [code, list] of byRegion) {
    const coord = regionCoordinates[code]
    const first = list[0]
    if (!coord || !first)
      continue
    const total = list.length
    const online = list.filter(n => n.online).length
    result.push({
      name: getRegionDisplayName(first.region),
      value: [coord[0], coord[1], total],
      code,
      online,
      total,
      uuid: first.uuid,
    })
  }
  return result
})

const chartOption = computed<EChartsOption>(() => {
  const isDark = appStore.isDark
  const areaColor = isDark ? '#262b36' : '#eef1f6'
  const borderColor = isDark ? '#3a4150' : '#d4d9e2'
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)'

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: isDark ? 'rgba(40,40,40,0.95)' : 'rgba(255,255,255,0.98)',
      borderWidth: 0,
      borderRadius: 8,
      padding: [10, 14],
      textStyle: { color: textColor, fontSize: 13 },
      formatter: (p: any) => {
        const d = p?.data
        if (!d)
          return ''
        const ratio = d.online === d.total
          ? '🟢 全部在线'
          : d.online === 0
            ? '🔴 全部离线'
            : `🟡 ${d.online}/${d.total} 在线`
        return `<div style="font-weight:600;margin-bottom:4px">${d.name}</div><div>节点数：${d.total}</div><div>${ratio}</div>`
      },
    },
    geo: {
      map: 'world',
      roam: true,
      zoom: 1.2,
      scaleLimit: { min: 1, max: 8 },
      itemStyle: { areaColor, borderColor, borderWidth: 0.5 },
      emphasis: {
        itemStyle: { areaColor: isDark ? '#39414f' : '#dfe4ee' },
        label: { show: false },
      },
      label: { show: false },
    },
    series: [
      {
        name: '服务器位置',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        data: points.value,
        symbolSize: (val: any) => Math.min(10 + (val?.[2] ?? 1) * 4, 30),
        showEffectOn: 'render',
        rippleEffect: { brushType: 'stroke', scale: 3 },
        zlevel: 1,
        itemStyle: {
          color: (p: any) => {
            const d = p?.data
            if (!d)
              return '#18a058'
            if (d.online === d.total)
              return '#18a058'
            if (d.online === 0)
              return '#d03050'
            return '#f0a020'
          },
        },
      },
    ],
  }
})

// 点击标记跳转至该地区首个节点详情
function onChartClick(params: any) {
  const uuid = params?.data?.uuid
  if (uuid)
    router.push({ name: 'instance-detail', params: { id: uuid } })
}
</script>

<template>
  <div class="world-map-wrapper">
    <div v-if="points.length === 0" class="py-16">
      <NEmpty description="暂无可定位的节点（缺少地区坐标）" />
    </div>
    <VChart
      v-else
      class="world-map"
      :option="chartOption"
      autoresize
      @click="onChartClick"
    />
  </div>
</template>

<style scoped lang="scss">
.world-map-wrapper {
  width: 100%;
}

.world-map {
  width: 100%;
  height: min(68vh, 640px);
  min-height: 420px;
}
</style>
