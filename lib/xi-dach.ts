/**
 * Xì dách probability engine — player is the "con", facing the "cái".
 * Exact enumeration over rank counts (suits never affect probability), with
 * memoization. Pure functions only; no UI imports.
 *
 * Rank encoding: 1 = A, 2..10 = number cards, 11 = J, 12 = Q, 13 = K.
 */

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
export type HandKind = 'bust' | 'normal' | 'nguLinh' | 'xiDach' | 'xiBan'

export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export function rankLabel(r: Rank): string {
  if (r === 1) return 'A'
  if (r === 11) return 'J'
  if (r === 12) return 'Q'
  if (r === 13) return 'K'
  return String(r)
}

export function rankPoint(r: Rank): number {
  return r >= 10 ? 10 : r
}

export interface SpecialRule {
  enabled: boolean
  /** Payout multiplier (profit per 1 unit bet) when this hand wins. */
  multiplier: number
}

export interface DenLangRule {
  enabled: boolean
  /** Con busts with this many points or more (hard total) => "đền làng". */
  threshold: number
  /** Loss multiplier (per 1 unit bet) when con is đền làng. */
  multiplier: number
}

export interface RuleSet {
  /** Đền làng: a very large bust loses more than a normal bust. */
  denLang: DenLangRule
  xiBan: SpecialRule
  xiDach: SpecialRule
  nguLinh: SpecialRule
  /** Con must have at least this many points to be allowed to stand (0 = free). */
  playerMinStand: number
  /** Cái keeps drawing while below this many points. */
  dealerStandAt: number
}

export const DEFAULT_RULES: RuleSet = {
  denLang: { enabled: true, threshold: 28, multiplier: 2 },
  xiBan: { enabled: true, multiplier: 3 },
  xiDach: { enabled: true, multiplier: 2 },
  nguLinh: { enabled: true, multiplier: 2 },
  playerMinStand: 16,
  dealerStandAt: 16,
}

export interface HandInfo {
  total: number
  hard: number
  aces: number
  count: number
  kind: HandKind
  isBust: boolean
}

/** Outcome of a line of play: expected profit plus win/tie/lose probabilities. */
export interface Outcome {
  ev: number
  win: number
  tie: number
  lose: number
}

const KIND_RANK: Record<HandKind, number> = { bust: 0, normal: 1, nguLinh: 2, xiDach: 3, xiBan: 4 }

function maxCards(rules: RuleSet): number {
  return rules.nguLinh.enabled ? 5 : 12
}

function evalCards(hard: number, aces: number, count: number, rules: RuleSet): HandInfo {
  const isBust = hard > 21
  const total = !isBust && aces > 0 && hard + 10 <= 21 ? hard + 10 : hard
  let kind: HandKind = 'normal'
  if (isBust) kind = 'bust'
  else if (count === 2 && aces === 2 && rules.xiBan.enabled) kind = 'xiBan'
  else if (count === 2 && aces === 1 && hard === 11 && rules.xiDach.enabled) kind = 'xiDach'
  else if (count >= 5 && rules.nguLinh.enabled) kind = 'nguLinh'
  return { total, hard, aces, count, kind, isBust }
}

export function evaluateHand(ranks: Rank[], rules: RuleSet = DEFAULT_RULES): HandInfo {
  let hard = 0
  let aces = 0
  for (const r of ranks) {
    hard += rankPoint(r)
    if (r === 1) aces++
  }
  return evalCards(hard, aces, ranks.length, rules)
}

function kindMultiplier(kind: HandKind, rules: RuleSet): number {
  if (kind === 'xiBan') return rules.xiBan.multiplier
  if (kind === 'xiDach') return rules.xiDach.multiplier
  if (kind === 'nguLinh') return rules.nguLinh.multiplier
  return 1
}

/** Loss (positive number) of the con when busting with the given hard total. */
export function bustLoss(hard: number, rules: RuleSet): number {
  return rules.denLang.enabled && hard >= rules.denLang.threshold ? rules.denLang.multiplier : 1
}

/** Profit of the con (per 1 unit bet) after the cái has finished. */
export function settle(p: HandInfo, d: HandInfo, rules: RuleSet): number {
  if (p.kind === 'bust') return -bustLoss(p.hard, rules)
  if (d.kind === 'bust') return kindMultiplier(p.kind, rules)
  const rp = KIND_RANK[p.kind]
  const rd = KIND_RANK[d.kind]
  if (rp > rd) return kindMultiplier(p.kind, rules)
  if (rp < rd) return -kindMultiplier(d.kind, rules)
  if (p.kind === 'normal') return Math.sign(p.total - d.total)
  return 0
}

function terminalOutcome(profit: number): Outcome {
  return { ev: profit, win: profit > 0 ? 1 : 0, tie: profit === 0 ? 1 : 0, lose: profit < 0 ? 1 : 0 }
}

const ZERO: Outcome = { ev: 0, win: 0, tie: 0, lose: 0 }

function addScaled(acc: Outcome, o: Outcome, w: number): void {
  acc.ev += o.ev * w
  acc.win += o.win * w
  acc.tie += o.tie * w
  acc.lose += o.lose * w
}

export interface AnalyzeInput {
  /** Con's current hand. */
  player: Rank[]
  /** Cái's known face-up card(s); may be empty — unknown cards are drawn from the unseen deck. */
  dealerUp: Rank[]
  /** Other cards already seen on the table. */
  exposed: Rank[]
}

export interface NextCardInfo {
  rank: Rank
  count: number
  prob: number
  /** Expected profit if this exact rank is drawn and play continues optimally. */
  ev: number
  bust: boolean
  /** Drawing this rank busts with a đền làng penalty. */
  denLang: boolean
}

export type Recommendation = 'HIT' | 'STAND' | 'EQUAL' | 'DONE'

export interface Analysis {
  status: 'ok' | 'incomplete' | 'invalid'
  error?: string
  hand?: HandInfo
  remaining?: number
  remainingByRank?: number[]
  /** Probability the next drawn card busts the con's hand. */
  bustProb?: number
  /** Probability the next card busts the con into đền làng (penalty loss). */
  denLangProb?: number
  safeProb?: number
  stand?: Outcome
  /** Hit, then play optimally afterwards. Null when hit is not possible. */
  hit?: Outcome | null
  nextCards?: NextCardInfo[]
  canHit?: boolean
  /** Stand is not allowed (below the minimum-points rule). */
  mustHit?: boolean
  /** Hand is decided automatically (bust / xì dách / xì bàn / ngũ linh). */
  terminal?: boolean
  recommendation?: Recommendation
  /** hit.ev - stand.ev */
  evDiff?: number
}

export const EQUAL_EPS = 0.005
const EPS = 1e-12

export function countCards(...groups: Rank[][]): number[] {
  const used = new Array<number>(14).fill(0)
  for (const g of groups) for (const r of g) used[r]++
  return used
}

export function analyze(input: AnalyzeInput, rules: RuleSet = DEFAULT_RULES): Analysis {
  const used = countCards(input.player, input.dealerUp, input.exposed)
  for (const r of RANKS) {
    if (used[r] > 4) {
      return { status: 'invalid', error: `Có quá 4 lá ${rankLabel(r)} — kiểm tra lại bài đã nhập.` }
    }
  }
  if (input.player.length < 2) return { status: 'incomplete' }

  // counts[r] = number of rank r still unseen (index 0 unused).
  const counts = new Array<number>(14).fill(0)
  let N = 0
  for (const r of RANKS) {
    counts[r] = 4 - used[r]
    N += counts[r]
  }
  const remainingByRank = counts.slice()

  const maxC = maxCards(rules)
  const dealerStart = evaluateHand(input.dealerUp, rules)
  const dealerMemo = new Map<string, Outcome>()
  const playerMemo = new Map<string, PlayerValue>()

  const mustDraw = (d: HandInfo): boolean =>
    d.count < 2 || (d.kind === 'normal' && d.total < rules.dealerStandAt && d.count < maxC)

  function dealerPlay(N: number, hard: number, aces: number, count: number, p: HandInfo): Outcome {
    const d = evalCards(hard, aces, count, rules)
    if (!mustDraw(d) || N === 0) return terminalOutcome(settle(p, d, rules))
    const key = `${counts.join('')}|${hard}|${aces}|${count}|${p.kind}${p.total}`
    const hit = dealerMemo.get(key)
    if (hit) return hit
    const acc: Outcome = { ...ZERO }
    for (const r of RANKS) {
      const c = counts[r]
      if (c === 0) continue
      counts[r]--
      const sub = dealerPlay(N - 1, hard + rankPoint(r), aces + (r === 1 ? 1 : 0), count + 1, p)
      counts[r]++
      addScaled(acc, sub, c / N)
    }
    dealerMemo.set(key, acc)
    return acc
  }

  interface PlayerValue {
    best: Outcome
    stand: Outcome
    hit: Outcome | null
    chooseHit: boolean
    mustHit: boolean
    terminal: boolean
  }

  function playerValue(N: number, hard: number, aces: number, count: number): PlayerValue {
    const me = evalCards(hard, aces, count, rules)
    if (me.isBust) {
      const o = terminalOutcome(-bustLoss(hard, rules))
      return { best: o, stand: o, hit: null, chooseHit: false, mustHit: false, terminal: true }
    }
    const key = `${counts.join('')}|${hard}|${aces}|${count}`
    const memo = playerMemo.get(key)
    if (memo) return memo

    const stand = dealerPlay(N, dealerStart.hard, dealerStart.aces, dealerStart.count, me)
    const special = me.kind === 'xiBan' || me.kind === 'xiDach' || me.kind === 'nguLinh'
    const canHit = !special && N > 0 && count < maxC
    let hit: Outcome | null = null
    if (canHit) {
      hit = { ...ZERO }
      for (const r of RANKS) {
        const c = counts[r]
        if (c === 0) continue
        counts[r]--
        const sub = playerValue(N - 1, hard + rankPoint(r), aces + (r === 1 ? 1 : 0), count + 1)
        counts[r]++
        addScaled(hit, sub.best, c / N)
      }
    }
    const mustHit = canHit && me.total < rules.playerMinStand
    const chooseHit = hit !== null && (mustHit || hit.ev > stand.ev + EPS)
    const value: PlayerValue = {
      best: chooseHit && hit ? hit : stand,
      stand,
      hit,
      chooseHit,
      mustHit,
      terminal: special,
    }
    playerMemo.set(key, value)
    return value
  }

  const myHard = input.player.reduce((s, r) => s + rankPoint(r), 0)
  const myAces = input.player.filter((r) => r === 1).length
  const me = evalCards(myHard, myAces, input.player.length, rules)

  if (me.isBust) {
    return {
      status: 'ok',
      hand: me,
      remaining: N,
      remainingByRank,
      terminal: true,
      canHit: false,
      mustHit: false,
      stand: terminalOutcome(-bustLoss(me.hard, rules)),
      hit: null,
      nextCards: [],
      bustProb: 0,
      denLangProb: 0,
      safeProb: 0,
      recommendation: 'DONE',
      evDiff: 0,
    }
  }

  const root = playerValue(N, myHard, myAces, input.player.length)

  const nextCards: NextCardInfo[] = []
  let bustCount = 0
  let denLangCount = 0
  if (root.hit) {
    for (const r of RANKS) {
      const c = counts[r]
      if (c === 0) continue
      const hardAfter = myHard + rankPoint(r)
      let ev: number
      let bust = false
      if (hardAfter > 21) {
        ev = -bustLoss(hardAfter, rules)
        if (bustLoss(hardAfter, rules) > 1) denLangCount += c
        bust = true
        bustCount += c
      } else {
        counts[r]--
        ev = playerValue(N - 1, hardAfter, myAces + (r === 1 ? 1 : 0), input.player.length + 1).best.ev
        counts[r]++
      }
      nextCards.push({ rank: r, count: c, prob: c / N, ev, bust, denLang: bust && bustLoss(hardAfter, rules) > 1 })
    }
  }

  let recommendation: Recommendation
  if (root.terminal || !root.hit) recommendation = 'DONE'
  else if (root.mustHit) recommendation = 'HIT'
  else if (Math.abs(root.hit.ev - root.stand.ev) < EQUAL_EPS) recommendation = 'EQUAL'
  else recommendation = root.hit.ev > root.stand.ev ? 'HIT' : 'STAND'

  const bustProb = root.hit && N > 0 ? bustCount / N : 0
  return {
    status: 'ok',
    hand: me,
    remaining: N,
    remainingByRank,
    bustProb,
    denLangProb: root.hit && N > 0 ? denLangCount / N : 0,
    safeProb: root.hit ? 1 - bustProb : 1,
    stand: root.stand,
    hit: root.hit,
    nextCards,
    canHit: root.hit !== null,
    mustHit: root.mustHit,
    terminal: root.terminal,
    recommendation,
    evDiff: root.hit ? root.hit.ev - root.stand.ev : 0,
  }
}
