// Document-level touches for the OxygenOS feel layer (oxygen.css): tap ripple, ⇄ spin,
// and a count-up + glow on calculator result values. Installed once from main.jsx.

const animOn = () => {
  const root = document.documentElement
  return root.getAttribute('data-reduce-motion') !== 'true' && (parseFloat(getComputedStyle(root).getPropertyValue('--cp-dur')) || 0) > 0
}

// Controls that ripple on tap. oxygen.css gives them position:relative + overflow:hidden.
const RIPPLE_TARGETS = '.cp-launch-card, .cp-btn:not(.cp-settings-btn), .cp-tab, .cp-mode-btn, .cp-sub'

function installRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !animOn()) return
    const el = e.target.closest(RIPPLE_TARGETS)
    if (!el || el.disabled) return
    const r = el.getBoundingClientRect()
    const d = Math.max(r.width, r.height) * 2.2
    const dot = document.createElement('span')
    dot.className = 'oxy-ripple'
    dot.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`
    el.appendChild(dot)
    dot.addEventListener('animationend', () => dot.remove(), { once: true })
  }, { passive: true })
}

// The ⇄ swap buttons spin half a turn each tap (uses the `rotate` property so it
// never fights a button's own transform).
function installSwapSpin() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn || btn.textContent.trim() !== '⇄' || !animOn()) return
    const turns = (Number(btn.dataset.spin) || 0) + 180
    btn.dataset.spin = turns
    btn.style.rotate = `${turns}deg`
    btn.style.transition = 'rotate 0.55s cubic-bezier(.34,1.56,.64,1)'
  })
}

// When a .cp-result-value changes, count a plain number up/down to it and glow.
// React sets the final text first; we replay the journey and always end on that text.
function installResultRoll() {
  const settling = new WeakSet()
  const obs = new MutationObserver((records) => {
    for (const rec of records) {
      const el = (rec.target.nodeType === 3 ? rec.target.parentElement : rec.target)?.closest?.('.cp-result-value')
      if (!el || settling.has(el) || !animOn()) continue
      const to = el.textContent.trim()
      const from = el.dataset.rollPrev
      el.dataset.rollPrev = to
      el.classList.remove('oxy-flash'); void el.offsetWidth; el.classList.add('oxy-flash')
      const num = /^-?\d+(\.\d+)?$/
      if (from === undefined || !num.test(from) || !num.test(to) || from === to) continue
      const a = Number(from), b = Number(to), dec = (to.split('.')[1] || '').length
      const t0 = performance.now(), dur = Math.min(700, (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cp-dur')) || 260) * 2.5)
      settling.add(el)
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur)
        el.textContent = p >= 1 ? to : (a + (b - a) * (1 - Math.pow(1 - p, 4))).toFixed(dec)
        if (p < 1) requestAnimationFrame(step)
        else setTimeout(() => settling.delete(el), 0)
      }
      requestAnimationFrame(step)
    }
  })
  obs.observe(document.body, { childList: true, characterData: true, subtree: true })
  // Remember each value's starting text so the first change has a "from".
  const seed = () => document.querySelectorAll('.cp-result-value').forEach((el) => {
    if (el.dataset.rollPrev === undefined) el.dataset.rollPrev = el.textContent.trim()
  })
  new MutationObserver(seed).observe(document.body, { childList: true, subtree: true })
  seed()
}

// Scroll depth in px for the frosted header (--oxy-scroll in oxygen.css)
function installScrollDepth() {
  addEventListener('scroll', () => {
    document.documentElement.style.setProperty('--oxy-scroll', Math.round(scrollY))
  }, { passive: true })
}

export function installLiveEffects() {
  installRipple()
  installSwapSpin()
  installResultRoll()
  installScrollDepth()
}
