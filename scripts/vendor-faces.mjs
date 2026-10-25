#!/usr/bin/env node
/**
 * 把 dsh-meme 内置的大肥鱼图库复制进本插件的 assets/faces/。
 *
 * 用法：先 `dsh plugin add dsh-meme`（或 npm i dsh-meme），再在本目录：
 *   node scripts/vendor-faces.mjs
 *
 * 复制完，图片路由会优先读本地文件，不装 dsh-meme、不联网也能显示。
 */
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FACE_FILES = {
  hello: 'morning/zaoshanghao.jpg',
  think: 'confused/jiazai.jpg',
  work: 'cpu/jiaban.jpg',
  slack: 'work/tangping.jpg',
  talk: 'happy/ok.jpg',
  rice: 'daily/ganfan.jpg',
  proud: 'happy/deyi.jpg',
  tsun: 'shy/haixiu.jpg',
  fuzz: 'angry/shengqi.jpg',
  boom: 'sad/yun.jpg',
  dead: 'sleep/shuijiao.jpg',
  broke: 'givemoney/yaoqian.jpg',
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'assets', 'faces')

let packDir
try {
  const require = createRequire(import.meta.url)
  packDir = join(dirname(require.resolve('dsh-meme/package.json')), 'memes', 'dafeiyu-001', 'memes')
} catch {
  console.error('找不到 dsh-meme。先装它：dsh plugin add dsh-meme')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
let copied = 0
for (const [id, rel] of Object.entries(FACE_FILES)) {
  const src = join(packDir, rel)
  if (!existsSync(src)) {
    console.warn('缺少 ' + rel)
    continue
  }
  copyFileSync(src, join(outDir, id + '.jpg'))
  copied += 1
}
console.log('已复制 ' + copied + ' 张到 ' + outDir)
