<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { NAlert, NDivider, NEmpty, NInput, NRadioButton, NRadioGroup, NTabPane, NTabs } from 'naive-ui'
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { isRegionMatch } from '@/utils/regionHelper'

defineOptions({
  name: 'HomeView',
})

const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))
const WorldMap = defineAsyncComponent(() => import('@/components/WorldMap.vue'))

const appStore = useAppStore()
const nodesStore = useNodesStore()
const router = useRouter()

onActivated(() => {
  if (appStore.homeScrollPosition > 0) {
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

onDeactivated(() => {
  appStore.homeScrollPosition = window.scrollY
})

const searchText = ref('')
const debouncedSearchText = ref('')

const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

const groups = computed(() => [
  {
    tab: '全部节点',
    name: 'all',
  },
  ...nodesStore.groups.map(group => ({
    tab: group,
    name: group,
  })),
])

const showGroupTabs = computed(() => {
  if (appStore.hideSingleGroupTab && nodesStore.groups.length <= 1) {
    return false
  }

  return true
})

watch(
  () => nodesStore.groups,
  (groups) => {
    const currentGroup = appStore.nodeSelectedGroup
    if (currentGroup !== 'all' && !groups.includes(currentGroup)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim()) {
    return true
  }

  const lowerSearch = search.toLowerCase().trim()

  if (node.name.toLowerCase().includes(lowerSearch)) {
    return true
  }

  if (node.region && isRegionMatch(node.region, search)) {
    return true
  }

  if (node.os && node.os.toLowerCase().includes(lowerSearch)) {
    return true
  }

  if (node.group && node.group.toLowerCase().includes(lowerSearch)) {
    return true
  }

  if (node.tags && node.tags.toLowerCase().includes(lowerSearch)) {
    return true
  }

  if (node.remark && node.remark.toLowerCase().includes(lowerSearch)) {
    return true
  }

  return false
}

const nodeList = computed(() => {
  let filteredNodes = appStore.nodeSelectedGroup === 'all'
    ? nodesStore.nodes
    : nodesStore.nodes.filter(node => node.group === appStore.nodeSelectedGroup)

  if (debouncedSearchText.value.trim()) {
    filteredNodes = filteredNodes.filter(node => isNodeMatchSearch(node, debouncedSearchText.value))
  }

  return filteredNodes
})

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({ name: 'instance-detail', params: { id: node.uuid } })
}

const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)

const blurClass = computed(() => {
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
</script>

<template>
  <div class="home-view">
    <div v-if="appStore.connectionError" class="alert px-4">
      <NAlert type="error" title="RPC 服务错误" show-icon>
        连接服务端失败，请检查网络设置或刷新页面后再试。
      </NAlert>
    </div>

    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <NAlert :type="appStore.alertType" :title="appStore.alertTitle || undefined" show-icon>
        <MarkdownRenderer :content="appStore.alertContent" />
      </NAlert>
    </div>

    <NodeGeneralCards />
    <NDivider class="my-0! px-4!" dashed />

    <div class="node-info p-4 flex flex-col gap-4">
      <div class="search flex gap-2 items-center">
        <NInput
          v-model:value="searchText"
          placeholder="搜索节点名称、地区、系统、分组、标签"
          :class="[{ 'glass-input-enabled': hasBackgroundBlur }, blurClass]"
        >
          <template #prefix>
            <div class="i-icon-park-outline-search" />
          </template>
        </NInput>

        <NRadioGroup v-model:value="appStore.nodeViewMode" class="view-selector">
          <NRadioButton value="card" class="view-selector-item">
            <div class="flex gap-1.5 items-center justify-center">
              <div class="i-icon-park-outline-view-grid-card" />
            </div>
          </NRadioButton>
          <NRadioButton value="list" class="view-selector-item">
            <div class="flex gap-1.5 items-center justify-center">
              <div class="i-icon-park-outline-view-list" />
            </div>
          </NRadioButton>
          <NRadioButton value="map" class="view-selector-item">
            <div class="flex gap-1.5 items-center justify-center">
              <div class="i-icon-park-outline-world" />
              <span class="view-selector-text hidden sm:inline">地图</span>
            </div>
          </NRadioButton>
        </NRadioGroup>
      </div>

      <div class="nodes">
        <NTabs v-if="showGroupTabs" v-model:value="appStore.nodeSelectedGroup" animated>
          <NTabPane v-for="group in groups" :key="group.name" :tab="group.tab" :name="group.name">
            <div
              v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'"
              class="gap-4 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]"
            >
              <NodeCard v-for="node in nodeList" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
            </div>

            <NodeList
              v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
              :nodes="nodeList"
              @click="handleNodeClick"
            />

            <WorldMap
              v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'map'"
              :nodes="nodeList"
              @node-click="handleNodeClick"
            />

            <div v-else class="text-gray-500 text-center">
              <NEmpty description="暂无节点" />
            </div>
          </NTabPane>
        </NTabs>

        <template v-else>
          <div
            v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'"
            class="gap-4 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]"
          >
            <NodeCard v-for="node in nodeList" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
          </div>

          <NodeList
            v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
            :nodes="nodeList"
            @click="handleNodeClick"
          />

          <WorldMap
            v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'map'"
            :nodes="nodeList"
            @node-click="handleNodeClick"
          />

          <div v-else class="text-gray-500 text-center">
            <NEmpty description="暂无节点" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.view-selector :deep(.n-radio__label) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-selector-text {
  font-size: 12px;
  line-height: 1;
}

.glass-input-enabled {
  background-color: rgba(255, 255, 255, 0.7) !important;
  border-radius: var(--n-border-radius);
}

html.dark .glass-input-enabled {
  background-color: rgba(24, 24, 28, 0.85) !important;
}
</style>
