<script setup lang="ts">
import type { ECharts, EChartsCoreOption } from 'echarts'
import type { NodeData } from '@/stores/nodes'
import * as echarts from 'echarts'
import { NCard, NEmpty, NScrollbar, NTag, NText, useThemeVars } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

interface GeoJsonFeature {
  id?: string
  properties?: {
    name?: string
  }
  geometry?: {
    type?: string
    coordinates?: unknown
  }
}

interface GeoJsonData {
  features?: GeoJsonFeature[]
}

interface RegionStats {
  code: string
  name: string
  onlineNodes: NodeData[]
  offlineNodes: NodeData[]
  coordinates: [number, number] | null
  mapName: string | null
}

const props = defineProps<{
  nodes: NodeData[]
}>()

const emit = defineEmits<{
  nodeClick: [node: NodeData]
}>()

const appStore = useAppStore()
const themeVars = useThemeVars()

const chartRef = ref<HTMLElement>()
const chartInstance = ref<ECharts | null>(null)
const geoJson = ref<GeoJsonData | null>(null)
const selectedRegionCode = ref<string | null>(null)
const geoViewState = ref<{ zoom?: number, center?: [number, number] }>({})

const mapLoaded = ref(false)

const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)

const cardBlurClass = computed(() => {
  if (!hasBackgroundBlur.value) {
    return ''
  }

  const radius = appStore.cardBlurRadius
  if (radius <= 8) {
    return 'glass-8'
  }
  if (radius <= 12) {
    return 'glass-12'
  }
  if (radius <= 16) {
    return 'glass-16'
  }
  if (radius <= 20) {
    return 'glass-20'
  }

  return `glass-${radius}`
})

const nameAliases: Record<string, string> = {
  'united states': 'USA',
  'united states of america': 'USA',
  'hong kong': 'China',
  'macau': 'China',
  'macao': 'China',
  'south korea': 'South Korea',
  'north korea': 'North Korea',
}

const coordinateOverrides: Record<string, [number, number]> = {
  HK: [114.1694, 22.3193],
  MO: [113.5439, 22.1987],
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('')
    }

    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }

  const normalized = color.replace(/\s+/g, '')
  if (normalized.startsWith('rgb(')) {
    return normalized.replace('rgb(', 'rgba(').replace(')', `,${alpha})`)
  }

  return color
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function flattenCoordinates(input: unknown, points: Array<[number, number]>): void {
  if (!Array.isArray(input)) {
    return
  }

  if (input.length >= 2 && typeof input[0] === 'number' && typeof input[1] === 'number') {
    points.push([input[0], input[1]])
    return
  }

  for (const item of input) {
    flattenCoordinates(item, points)
  }
}

function getGeometryCenter(feature: GeoJsonFeature): [number, number] | null {
  const points: Array<[number, number]> = []
  flattenCoordinates(feature.geometry?.coordinates, points)

  if (points.length === 0) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

const featureLookup = computed(() => {
  const byName = new Map<string, { name: string, center: [number, number] | null }>()

  for (const feature of geoJson.value?.features ?? []) {
    const name = feature.properties?.name
    if (!name) {
      continue
    }

    byName.set(normalizeName(name), {
      name,
      center: getGeometryCenter(feature),
    })
  }

  return byName
})

function resolveRegion(code: string, displayName: string): { mapName: string | null, coordinates: [number, number] | null } {
  if (coordinateOverrides[code]) {
    return {
      mapName: nameAliases[normalizeName(displayName)] ?? displayName,
      coordinates: coordinateOverrides[code],
    }
  }

  const normalized = normalizeName(displayName)
  const aliasName = nameAliases[normalized]
  const directMatch = featureLookup.value.get(normalized)
  const aliasMatch = aliasName ? featureLookup.value.get(normalizeName(aliasName)) : null
  const target = directMatch ?? aliasMatch ?? null

  return {
    mapName: target?.name ?? null,
    coordinates: target?.center ?? null,
  }
}

const regionStats = computed<RegionStats[]>(() => {
  const grouped = new Map<string, RegionStats>()

  for (const node of props.nodes) {
    const code = getRegionCode(node.region)
    const displayName = getRegionDisplayName(node.region, 'en')
    const resolved = resolveRegion(code, displayName)

    if (!grouped.has(code)) {
      grouped.set(code, {
        code,
        name: getRegionDisplayName(node.region),
        onlineNodes: [],
        offlineNodes: [],
        coordinates: resolved.coordinates,
        mapName: resolved.mapName,
      })
    }

    const region = grouped.get(code)
    if (!region) {
      continue
    }

    if (!region.coordinates && resolved.coordinates) {
      region.coordinates = resolved.coordinates
    }
    if (!region.mapName && resolved.mapName) {
      region.mapName = resolved.mapName
    }

    if (node.online) {
      region.onlineNodes.push(node)
    }
    else {
      region.offlineNodes.push(node)
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const aTotal = a.onlineNodes.length + a.offlineNodes.length
    const bTotal = b.onlineNodes.length + b.offlineNodes.length
    return bTotal - aTotal
  })
})

const onlineRegionCount = computed(() => regionStats.value.filter(region => region.onlineNodes.length > 0).length)
const unresolvedRegions = computed(() => regionStats.value.filter(region => !region.coordinates))

const selectedRegion = computed(() => {
  const defaultRegion = regionStats.value[0] ?? null
  return regionStats.value.find(region => region.code === selectedRegionCode.value) ?? defaultRegion
})

watch(regionStats, (regions) => {
  if (!regions.length) {
    selectedRegionCode.value = null
    return
  }

  if (!regions.some(region => region.code === selectedRegionCode.value)) {
    selectedRegionCode.value = regions[0]?.code ?? null
  }
}, { immediate: true })

async function ensureMapData(): Promise<void> {
  if (mapLoaded.value) {
    return
  }

  const response = await fetch('/world.geojson')
  const data = await response.json() as GeoJsonData
  geoJson.value = data
  echarts.registerMap('komari-world', data as never)
  mapLoaded.value = true
}

function buildMapOption(): EChartsCoreOption {
  const baseAreaColor = appStore.isDark ? '#16202c' : '#edf3fb'
  const baseBorderColor = appStore.isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(71, 85, 105, 0.16)'
  const onlineColor = themeVars.value.successColor
  const offlineColor = themeVars.value.errorColor
  const mixedColor = themeVars.value.warningColor

  const regions = regionStats.value
    .filter(region => region.mapName)
    .map((region) => {
      const hasOnline = region.onlineNodes.length > 0
      const hasOffline = region.offlineNodes.length > 0
      const areaColor = hasOnline && hasOffline
        ? mixedColor
        : hasOnline
          ? onlineColor
          : offlineColor

      return {
        name: region.mapName!,
        itemStyle: {
          areaColor: withAlpha(areaColor, appStore.isDark ? 0.26 : 0.22),
          borderColor: withAlpha(areaColor, appStore.isDark ? 0.42 : 0.3),
        },
      }
    })

  const onlinePoints = regionStats.value
    .filter(region => region.coordinates && region.onlineNodes.length > 0)
    .map(region => ({
      name: region.name,
      regionCode: region.code,
      value: [
        region.coordinates![0] - (region.offlineNodes.length > 0 ? 2.4 : 0),
        region.coordinates![1],
        region.onlineNodes.length,
      ],
    }))

  const offlinePoints = regionStats.value
    .filter(region => region.coordinates && region.offlineNodes.length > 0)
    .map(region => ({
      name: region.name,
      regionCode: region.code,
      value: [
        region.coordinates![0] + (region.onlineNodes.length > 0 ? 2.4 : 0),
        region.coordinates![1],
        region.offlineNodes.length,
      ],
    }))

  return {
    backgroundColor: 'transparent',
    animationDuration: 500,
    tooltip: {
      trigger: 'item',
      backgroundColor: appStore.isDark ? 'rgba(16, 18, 24, 0.96)' : 'rgba(255, 255, 255, 0.96)',
      borderWidth: 0,
      textStyle: {
        color: themeVars.value.textColorBase,
      },
      formatter: (params: Record<string, unknown>) => {
        const regionCode = typeof params.regionCode === 'string'
          ? params.regionCode
          : regionStats.value.find(region => region.mapName === params.name)?.code

        const region = regionStats.value.find(item => item.code === regionCode)
        if (!region) {
          return String(params.name ?? '')
        }

        const online = region.onlineNodes.map(node => node.name).join('<br>')
        const offline = region.offlineNodes.map(node => node.name).join('<br>')

        return [
          `<strong>${region.name}</strong>`,
          `在线 ${region.onlineNodes.length} / 离线 ${region.offlineNodes.length}`,
          online ? `<span style="color:${themeVars.value.successColor}">在线节点</span><br>${online}` : '',
          offline ? `<span style="color:${themeVars.value.errorColor}">离线节点</span><br>${offline}` : '',
        ].filter(Boolean).join('<br>')
      },
    },
    geo: {
      map: 'komari-world',
      roam: true,
      layoutCenter: ['40%', '50%'],
      layoutSize: '122%',
      zoom: geoViewState.value.zoom,
      center: geoViewState.value.center,
      itemStyle: {
        areaColor: baseAreaColor,
        borderColor: baseBorderColor,
        borderWidth: 0.8,
      },
      emphasis: {
        itemStyle: {
          areaColor: appStore.isDark ? '#223247' : '#dbeafe',
        },
        label: {
          show: false,
        },
      },
      select: {
        disabled: true,
      },
      regions,
    },
    series: [
      {
        name: '在线节点',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        rippleEffect: {
          scale: 3.5,
          brushType: 'stroke',
        },
        symbolSize: (value: unknown) => {
          const count = Array.isArray(value) && typeof value[2] === 'number' ? value[2] : 1
          return Math.min(12 + count * 2, 28)
        },
        itemStyle: {
          color: onlineColor,
          shadowBlur: 24,
          shadowColor: withAlpha(onlineColor, 0.55),
        },
        data: onlinePoints,
      },
      {
        name: '离线节点',
        type: 'scatter',
        coordinateSystem: 'geo',
        symbolSize: (value: unknown) => {
          const count = Array.isArray(value) && typeof value[2] === 'number' ? value[2] : 1
          return Math.min(10 + count * 1.6, 22)
        },
        itemStyle: {
          color: offlineColor,
          opacity: 0.88,
        },
        data: offlinePoints,
      },
    ],
  }
}

function syncChart(): void {
  if (!chartInstance.value || !mapLoaded.value) {
    return
  }

  chartInstance.value.setOption(buildMapOption())
}

function syncGeoViewState(): void {
  const option = chartInstance.value?.getOption()
  const geo = Array.isArray(option?.geo) ? option.geo[0] : undefined
  if (!geo) {
    return
  }

  const zoom = typeof geo.zoom === 'number' ? geo.zoom : undefined
  const center = Array.isArray(geo.center)
    && typeof geo.center[0] === 'number'
    && typeof geo.center[1] === 'number'
    ? [geo.center[0], geo.center[1]] as [number, number]
    : undefined

  geoViewState.value = {
    zoom,
    center,
  }
}

function initChart(): void {
  if (!chartRef.value) {
    return
  }

  chartInstance.value = echarts.init(chartRef.value)
  chartInstance.value.on('click', (params: Record<string, unknown>) => {
    const regionCode = typeof params.regionCode === 'string'
      ? params.regionCode
      : regionStats.value.find(region => region.mapName === params.name)?.code

    if (regionCode) {
      selectedRegionCode.value = regionCode
    }
  })
  chartInstance.value.on('georoam', () => {
    syncGeoViewState()
  })

  syncChart()
}

function resizeChart(): void {
  chartInstance.value?.resize()
}

watch(
  [regionStats, () => appStore.isDark, () => appStore.backgroundEnabled],
  () => {
    syncChart()
  },
  { deep: true },
)

onMounted(async () => {
  await ensureMapData()
  await nextTick()
  initChart()
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chartInstance.value?.dispose()
})
</script>

<template>
  <div class="world-map-view gap-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_380px]">
    <NCard
      class="map-panel"
      :class="[
        { 'glass-card-enabled': hasBackgroundBlur },
        cardBlurClass,
      ]"
      content-class="p-0!"
    >
      <template #header>
        <div class="flex flex-wrap gap-3 items-center justify-between">
          <div class="flex flex-col">
            <div class="flex gap-2 items-center">
              <div class="i-icon-park-outline-world text-lg text-[--n-primary-color]" />
              <NText class="text-lg font-semibold">
                全球节点分布
              </NText>
            </div>
            <NText :depth="3" class="text-sm">
              地图会随当前搜索词和分组选项同步过滤
            </NText>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <NTag size="small" type="success">
              在线地区 {{ onlineRegionCount }}
            </NTag>
            <NTag size="small" type="info">
              节点总数 {{ props.nodes.length }}
            </NTag>
            <NTag v-if="unresolvedRegions.length > 0" size="small" type="warning">
              未定位 {{ unresolvedRegions.length }}
            </NTag>
          </div>
        </div>
      </template>

      <div ref="chartRef" class="world-map-canvas" />
    </NCard>

    <NCard
      class="map-sidebar"
      :class="[
        { 'glass-card-enabled': hasBackgroundBlur },
        cardBlurClass,
      ]"
    >
      <template #header>
        <div class="flex flex-col">
          <NText class="text-lg font-semibold">
            地区明细
          </NText>
          <NText :depth="3" class="text-sm">
            点击地图上的地区或标记可切换明细
          </NText>
        </div>
      </template>

      <div v-if="selectedRegion" class="flex flex-col gap-4">
        <div class="gap-2 grid grid-cols-2">
          <div class="summary-chip summary-chip--online">
            <span class="summary-chip__label">在线</span>
            <span class="summary-chip__value">{{ selectedRegion.onlineNodes.length }}</span>
          </div>
          <div class="summary-chip summary-chip--offline">
            <span class="summary-chip__label">离线</span>
            <span class="summary-chip__value">{{ selectedRegion.offlineNodes.length }}</span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <NText class="text-base font-semibold">
            {{ selectedRegion.name }}
          </NText>
          <NTag size="small" :type="selectedRegion.coordinates ? 'default' : 'warning'">
            {{ selectedRegion.coordinates ? '已定位' : '未定位' }}
          </NTag>
        </div>

        <NScrollbar class="region-node-list">
          <div class="flex flex-col gap-3">
            <div v-for="node in selectedRegion.onlineNodes" :key="node.uuid" class="region-node region-node--online" @click="emit('nodeClick', node)">
              <div class="flex gap-3 items-center justify-between">
                <div class="flex flex-col min-w-0">
                  <span class="font-medium truncate">{{ node.name }}</span>
                  <span class="text-xs text-[--n-text-color-3] truncate">{{ node.group || '未分组' }}</span>
                </div>
                <NTag size="small" type="success">
                  在线
                </NTag>
              </div>
            </div>

            <div v-for="node in selectedRegion.offlineNodes" :key="node.uuid" class="region-node region-node--offline" @click="emit('nodeClick', node)">
              <div class="flex gap-3 items-center justify-between">
                <div class="flex flex-col min-w-0">
                  <span class="font-medium truncate">{{ node.name }}</span>
                  <span class="text-xs text-[--n-text-color-3] truncate">{{ node.group || '未分组' }}</span>
                </div>
                <NTag size="small" type="error">
                  离线
                </NTag>
              </div>
            </div>
          </div>
        </NScrollbar>
      </div>

      <NEmpty v-else description="暂无可展示的地区数据" />
    </NCard>
  </div>
</template>

<style scoped lang="scss">
.world-map-canvas {
  width: 100%;
  height: 680px;
}

.map-sidebar {
  min-height: 680px;
}

.summary-chip {
  display: flex;
  min-height: 84px;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--n-border-color) 72%, transparent);
  border-radius: calc(var(--n-border-radius) + 2px);
  background: color-mix(in srgb, var(--n-color) 82%, transparent);
}

.summary-chip__label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.summary-chip__value {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
}

.summary-chip--online .summary-chip__value {
  color: var(--n-success-color);
}

.summary-chip--offline .summary-chip__value {
  color: var(--n-error-color);
}

.region-node-list {
  max-height: 490px;
}

.region-node {
  cursor: pointer;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--n-border-color) 68%, transparent);
  border-radius: calc(var(--n-border-radius) + 2px);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
  background: color-mix(in srgb, var(--n-color) 84%, transparent);
}

.region-node:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--n-primary-color) 32%, var(--n-border-color));
}

.region-node--online {
  background: color-mix(in srgb, var(--n-success-color) 10%, var(--n-color));
}

.region-node--offline {
  background: color-mix(in srgb, var(--n-error-color) 8%, var(--n-color));
}

@media (max-width: 1280px) {
  .world-map-canvas {
    height: 560px;
  }

  .map-sidebar {
    min-height: auto;
  }

  .region-node-list {
    max-height: 360px;
  }
}

@media (max-width: 640px) {
  .world-map-canvas {
    height: 420px;
  }
}
</style>
