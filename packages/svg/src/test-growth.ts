// How a reader's time grows with the length of its input, measured so that a crowded machine
// doesn't change the answer: what the tests of hostile files check linear time with.

/** The most `growth` may give for an input ten times as long: well above linear, well below quadratic. */
export const MAX_GROWTH = 30

/** The clock `growth` times runs with, in milliseconds, once it has been picked. */
let clock: (() => number) | undefined

/**
 * What `read` makes of `large`, and how many times longer it takes on `large` than on `small`, an
 * input a tenth as long. `times` is about 10 when the time grows linearly and about 100 when it
 * grows quadratically.
 *
 * Each sample times 10 runs of `small` back to back against 1 run of `large`, so the two take about
 * as long and a crowded machine slows both alike, and the fastest of up to 5 samples of each counts.
 * The time is the process's CPU time, which leaves out the time the machine pauses it, where that
 * clock steps by less than a millisecond; on Windows it steps by 15.6 ms, so the wall clock times
 * the runs there. The samples stop once they have taken 250 ms in all, so slow code still finishes
 * soon.
 */
export function growth<T>(read: (text: string) => T, small: string, large: string): { result: T; times: number } {
  clock ??= cpuSteps() < 1 ? cpuTime : () => performance.now()
  const now = clock
  const timed = (run: () => T) => {
    const started = now()
    const result = run()
    return { result, took: now() - started }
  }
  const tenSmall = () => {
    for (let run = 1; run < 10; run++) read(small)
    return read(small)
  }
  // An untimed first run, so the code the runs take is compiled before they are timed.
  read(small)
  let fastestTen = Number.POSITIVE_INFINITY
  let fastestLarge = Number.POSITIVE_INFINITY
  let result: T | undefined
  let spent = 0
  for (let sample = 0; sample < 5 && spent < 250; sample++) {
    const ten = timed(tenSmall).took
    const ran = timed(() => read(large))
    fastestTen = Math.min(fastestTen, ten)
    fastestLarge = Math.min(fastestLarge, ran.took)
    result = ran.result
    spent += ten + ran.took
  }
  // The first sample always runs, so `result` is what `read` made of `large`.
  return { result: result as T, times: (10 * fastestLarge) / fastestTen }
}

/** The process's CPU time so far, user and system, in milliseconds. */
function cpuTime() {
  const { user, system } = process.cpuUsage()
  return (user + system) / 1000
}

/** The step the CPU clock moves by, in milliseconds, from two steps watched in a busy loop. */
function cpuSteps() {
  const stepAfter = (from: number) => {
    const until = performance.now() + 100
    let at = cpuTime()
    while (at === from && performance.now() < until) at = cpuTime()
    return at
  }
  const first = stepAfter(cpuTime())
  const second = stepAfter(first)
  return second > first ? second - first : Number.POSITIVE_INFINITY
}
