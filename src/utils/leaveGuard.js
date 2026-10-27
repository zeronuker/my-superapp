// Lets a screen ask before the app navigates away from it (the tab bar, HOME). The Duty Log's edit page
// registers one so it can ask about its links first. `guard(go)` decides: call `go()` to carry on.

let guard = null

export const setLeaveGuard = (fn) => { guard = fn }

// Runs `go` straight away, or through the registered guard.
export const guardLeave = (go) => (guard ? guard(go) : go())
