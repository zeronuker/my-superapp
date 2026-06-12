/**
 * Safe expression evaluator for the scientific calculator.
 * Supports: + - × ÷ ^, parentheses, unary minus, constants (pi, e),
 * functions (sin cos tan asin acos atan log ln sqrt abs exp).
 * No eval()/Function(). Shunting-yard → RPN.
 *
 * Trig respects angleMode ('deg' | 'rad'): inputs to sin/cos/tan and outputs
 * of asin/acos/atan are converted accordingly.
 */

const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs', 'exp'])
const CONSTS = { pi: Math.PI, e: Math.E }

// precedence + associativity
const OPS = {
  '+': { p: 2, r: false }, '-': { p: 2, r: false },
  '*': { p: 3, r: false }, '/': { p: 3, r: false },
  '^': { p: 4, r: true },
  'u-': { p: 5, r: true },          // unary minus
}

function tokenize(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt').replace(/π/g, 'pi')
  const tokens = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ') { i++; continue }
    if (/[0-9.]/.test(c)) {
      let num = ''
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++]
      if ((num.match(/\./g) || []).length > 1) throw new Error('bad number')
      tokens.push({ t: 'num', v: parseFloat(num) })
      continue
    }
    if (/[a-zA-Z]/.test(c)) {
      let name = ''
      while (i < s.length && /[a-zA-Z]/.test(s[i])) name += s[i++]
      const lc = name.toLowerCase()
      if (FUNCS.has(lc)) tokens.push({ t: 'func', v: lc })
      else if (lc in CONSTS) tokens.push({ t: 'num', v: CONSTS[lc] })
      else throw new Error(`unknown name ${name}`)
      continue
    }
    if (c in OPS || c === '(' || c === ')') { tokens.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`bad char ${c}`)
  }
  return tokens
}

function toRpn(tokens) {
  const out = [], stack = []
  let prev = null
  for (const tk of tokens) {
    if (tk.t === 'num') out.push(tk)
    else if (tk.t === 'func') stack.push(tk)
    else if (tk.v === '(') stack.push(tk)
    else if (tk.v === ')') {
      while (stack.length && stack[stack.length - 1].v !== '(') out.push(stack.pop())
      if (!stack.length) throw new Error('mismatched )')
      stack.pop()                                   // discard '('
      if (stack.length && stack[stack.length - 1].t === 'func') out.push(stack.pop())
    } else {
      // operator — detect unary minus
      let op = tk.v
      if (op === '-' && (prev === null || (prev.t === 'op' && prev.v !== ')'))) op = 'u-'
      const o1 = OPS[op]
      if (!o1) throw new Error(`bad op ${op}`)
      while (stack.length) {
        const top = stack[stack.length - 1]
        if (top.t === 'func') { out.push(stack.pop()); continue }
        const o2 = OPS[top.v]
        if (o2 && (o2.p > o1.p || (o2.p === o1.p && !o1.r))) out.push(stack.pop())
        else break
      }
      stack.push({ t: 'op', v: op })
    }
    prev = tk
  }
  while (stack.length) {
    const s = stack.pop()
    if (s.v === '(') throw new Error('mismatched (')
    out.push(s)
  }
  return out
}

function applyFunc(name, x, angleMode) {
  const toRad = angleMode === 'deg' ? x * Math.PI / 180 : x
  const fromRad = (r) => angleMode === 'deg' ? r * 180 / Math.PI : r
  switch (name) {
    case 'sin': return Math.sin(toRad)
    case 'cos': return Math.cos(toRad)
    case 'tan': return Math.tan(toRad)
    case 'asin': return fromRad(Math.asin(x))
    case 'acos': return fromRad(Math.acos(x))
    case 'atan': return fromRad(Math.atan(x))
    case 'log': return Math.log10(x)
    case 'ln': return Math.log(x)
    case 'sqrt': return Math.sqrt(x)
    case 'abs': return Math.abs(x)
    case 'exp': return Math.exp(x)
    default: throw new Error(`bad func ${name}`)
  }
}

function evalRpn(rpn, angleMode) {
  const st = []
  for (const tk of rpn) {
    if (tk.t === 'num') st.push(tk.v)
    else if (tk.t === 'func') { if (!st.length) throw new Error('arg'); st.push(applyFunc(tk.v, st.pop(), angleMode)) }
    else if (tk.v === 'u-') { if (!st.length) throw new Error('arg'); st.push(-st.pop()) }
    else {
      const b = st.pop(), a = st.pop()
      if (a === undefined || b === undefined) throw new Error('arg')
      st.push(tk.v === '+' ? a + b : tk.v === '-' ? a - b : tk.v === '*' ? a * b : tk.v === '/' ? a / b : Math.pow(a, b))
    }
  }
  if (st.length !== 1) throw new Error('bad expr')
  return st[0]
}

/** Evaluate `expr`. Returns number; throws on malformed input. */
export function evaluate(expr, angleMode = 'deg') {
  const r = evalRpn(toRpn(tokenize(expr)), angleMode)
  if (typeof r !== 'number' || Number.isNaN(r) || !Number.isFinite(r)) throw new Error('math error')
  return r
}
