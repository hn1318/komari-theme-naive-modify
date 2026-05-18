import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { initPointerGlow } from '@/utils/pointerGlow'
import App from './App.vue'
import router from './router'

import './styles/main.scss'
import 'virtual:uno.css'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

initPointerGlow()

app.mount('#app')
