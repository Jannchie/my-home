// 墙上的设备：可视对讲、热水器遥控面板、浴室遥控面板。默认按门自动摆在房子里（three/wallDevices.ts），
// 接管 / 手动摆成这里的挂墙素材后可以选中、沿墙拖动。模型同自动摆的（three/wallDeviceModels.ts），安装高度也一样。

import * as THREE from 'three'
import type { AssetDef } from '../kit'
import { fitGroup } from '../geo'
import { define } from '../packkit'
import { bathRemote, intercomMonitor } from '../wallDeviceModels'

/** 壁挂物：背面（最小 z）贴到 -d/2，水平居中，最低点 = mount（同 cameras-home.ts） */
function fitWall(g: THREE.Object3D, mount: number, d: number) {
  const outer = fitGroup(g, mount, true)
  outer.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(outer, true)
  g.position.z += -d / 2 - b.min.z
  return outer
}

// 自动摆时的安装高度 150 / 150 / 110，模型在它上下各半个高：最低点 142.5 / 144 / 104
const INTERCOM_MOUNT = 142.5
const HEATER_MOUNT = 144
const BATH_MOUNT = 104

export const WALL_DEVICES: AssetDef[] = [
  define('wd-intercom', '可视对讲', 'appliance', [20, 3, 15], [['modern', '#f5f3ee']], () => fitWall(intercomMonitor(), INTERCOM_MOUNT, 3), {
    mount: INTERCOM_MOUNT,
    type: 'intercom',
    tags: ['intercom'],
    limit: { scope: 'house', max: 1 },
  }),
  define('wd-heater-remote', '热水器遥控面板', 'appliance', [13, 3, 12], [['modern', '#f5f3ee']], () => fitWall(bathRemote(), HEATER_MOUNT, 3), {
    mount: HEATER_MOUNT,
    type: 'control-panel',
    tags: ['control-panel'],
    limit: { scope: 'house', max: 1 },
  }),
  define('wd-bath-remote', '浴室遥控面板', 'appliance', [13, 3, 12], [['modern', '#f5f3ee']], () => fitWall(bathRemote(), BATH_MOUNT, 3), {
    mount: BATH_MOUNT,
    type: 'control-panel',
    tags: ['control-panel'],
    limit: { scope: 'house', max: 1 },
  }),
]
