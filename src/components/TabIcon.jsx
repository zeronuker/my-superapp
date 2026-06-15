import React from 'react'
import { useCalculatorStore } from '../store/calculatorStore'

/**
 * Selectable icon sets.
 *   'classic' → built-in emoji (no assets, always available).
 *   image sets → files under public/icons/<set>/<tab-id>.{svg,png}, one per tab.
 * Rename the image-set labels once the real artwork is in (placeholders for now).
 */
export const ICON_SETS = [
  { id: 'classic', label: 'EMOJI' },
  { id: 'set-a',   label: 'MONO' },
  { id: 'set-b',   label: 'COLOR' },
]

// Extensions probed in order — files may be a mix of svg/png across a set.
const EXT_TRY = ['svg', 'png']

/**
 * Renders a tab/group icon honouring the selected icon set. For image sets it
 * loads /icons/<set>/<id>.svg (then .png), falling back to the emoji if neither
 * asset exists — so the app degrades gracefully before artwork is added and
 * works offline (missing files just show the emoji).
 */
export function TabIcon({ id, emoji, size = 18, style }) {
  const iconSet = useCalculatorStore(s => s.settings.iconSet) || 'classic'
  const [extIdx, setExtIdx] = React.useState(0)
  const [failed, setFailed] = React.useState(false)

  // Re-probe when the set or tab changes.
  React.useEffect(() => { setExtIdx(0); setFailed(false) }, [iconSet, id])

  if (iconSet === 'classic' || failed || !id) {
    return <span style={{ fontSize: size, lineHeight: 1, ...style }}>{emoji}</span>
  }

  return (
    <img
      src={`/icons/${iconSet}/${id}.${EXT_TRY[extIdx]}`}
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', objectFit: 'contain', verticalAlign: 'middle', ...style }}
      onError={() => {
        if (extIdx < EXT_TRY.length - 1) setExtIdx(extIdx + 1)
        else setFailed(true)
      }}
    />
  )
}
