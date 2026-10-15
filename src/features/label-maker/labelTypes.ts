import type { ComponentType } from 'react'
import LocationSkuTab from './tabs/LocationSkuTab.tsx'

export type LabelType = { id: string; label: string; component: ComponentType }

// Thêm loại label mới: thêm 1 phần tử vào đây + 1 file trong tabs/.
export const LABEL_TYPES: LabelType[] = [
  { id: 'location-sku', label: 'Label vị trí / SKU', component: LocationSkuTab },
]
