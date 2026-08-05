"use client"

import { Fragment, useMemo, useState, useEffect, useRef } from 'react'
import {
  AlertTriangle, Award, Bell, BookOpen, Bot, Brain, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Code2,
  Database, FileText, FileUp, Flame, GraduationCap, HelpCircle, LayoutDashboard, Lock, LogOut, Map as MapIcon, Menu, MoreHorizontal,
  MessageCircle, Network, Maximize2, PanelLeftClose, PanelRightOpen, Pencil, Plus, RefreshCw, RotateCcw, Search, Settings,
  ShieldCheck, Sparkles, Target, Terminal, Trash2, Trophy, Undo2, UploadCloud, Users, X, Zap, ZoomIn, ZoomOut
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prototypeData, getSkillTree, mockCS210Payload, requestHelpSubtree, nameQuests } from '@/lib/cardinal-repository'
import type {
  SkillNode as DomainSkillNode, SkillTreePayload, Mission as DomainMission, SkillStatus, NodeKind, QuestNaming
} from '@/lib/cardinal-domain'
import { APP_ROUTES, type AppRoute } from '@/lib/cardinal-routes'
import { deriveStatuses, evaluateSkillUnlockState, levelForXp, levelProgress, totalXp, treeFromSkills, xpForLevel, XP_PER_LEVEL } from '@/lib/progression'
import { buildHelpSubtree, xpBreakdown, HELP_SHARE } from '@shared/subtree'
import { fragmentMissionXp, isNodeMastered, missionsForNode, nodeXpEarned, nodeXpFromMissions } from '@shared/missions'
import { learnerMode, paceTarget, personalXpPerLevel, rankNextQuests, shouldOfferHelp } from '@shared/adaptive'
import { ALL_PROFILES, LEARNER_PROFILES, generateSignals, type LearnerProfileId } from '@shared/learners'
import type { NodeSignal } from '@shared/types'
import {
  arrowheadPoints, bendsOf, crossbarByPrereq, edgeWaypoints, orthogonalPath, waypointFractions,
  type Routing
} from '@shared/edgeRouting'
import { graftHelpSubtree } from '@/lib/help-subtree'
import { validateSkillGraph } from '@/lib/graph-validation'
import { computeAutoLayout } from '@/lib/auto-layout'
import { localStorageTreeLayoutAdapter, type UserTreeLayout } from '@/lib/tree-layout-persistence'
import { profileStorageAdapter, type StudentProfile, defaultProfile } from '@/lib/profile-persistence'
import { questNameStorageAdapter, hasNameOverride, type QuestNameMap } from '@/lib/quest-name-persistence'
import { shellCollapseStorage, type ShellCollapseState } from '@/lib/sidebar-collapse-persistence'
import { HeroSkillTree } from '@/components/hero-skill-tree'

export interface AICompanionContext {
  courseId?: string
  courseTitle?: string
  skillId?: string
  skillTitle?: string
  description?: string
  learningObjective?: string
  difficulty?: string
  status?: string
  prerequisites?: string[]
}

const nav: { route: AppRoute; label: string; icon: LucideIcon }[] = [
  { route: 'dashboard', label: 'Skill tree', icon: MapIcon },
  { route: 'missions', label: 'Missions', icon: Target },
  { route: 'universal', label: 'Universal skills', icon: Sparkles },
  { route: 'companion', label: 'AI companion', icon: Bot },
  { route: 'achievements', label: 'Achievements', icon: Trophy },
  { route: 'syllabus', label: 'Import syllabus', icon: FileUp },
  { route: 'instructor', label: 'Instructor view', icon: Users },
]

const iconMap: Record<string, LucideIcon> = {
  code: Code2,
  database: Database,
  network: Network,
  shield: ShieldCheck,
  brain: Brain,
  terminal: Terminal
}

/**
 * The one XP calculation in this app.
 *
 * The header used to carry a hardcoded 2,840 XP / level 6 while the meter below
 * it computed level 3 from the same chart, so a student saw two levels for
 * themselves on one screen. Everything that shows XP or a level now calls this,
 * and the chart is the only input.
 */
export interface CourseXpReadout {
  earned: number
  available: number
  graded: { earned: number; available: number }
  supplemental: { earned: number; available: number }
  level: number
  /** Percent of the way to the next level, 0-100. */
  pct: number
  toNextLevel: number
  xpPerLevel: number
}

function readCourseXp(
  skills: { id: string; xpReward?: number; prerequisiteIds?: string[]; graded?: boolean }[],
  masteredIds: Iterable<string>,
  xpPerLevel: number
): CourseXpReadout {
  const breakdown = xpBreakdown(treeFromSkills(skills), masteredIds)
  const level = levelForXp(breakdown.earned, xpPerLevel)
  return {
    earned: breakdown.earned,
    available: breakdown.available,
    graded: breakdown.graded,
    supplemental: breakdown.supplemental,
    level,
    pct: Math.round(levelProgress(breakdown.earned, xpPerLevel) * 100),
    toNextLevel: Math.max(0, xpForLevel(level + 1, xpPerLevel) - breakdown.earned),
    xpPerLevel
  }
}

/** What to show as a node's quest title, and where that title came from. */
function questTitleOf(naming: QuestNaming | undefined, fallback: string) {
  if (naming?.titleOverride) return { text: naming.titleOverride, source: 'override' as const }
  if (naming?.title) return { text: naming.title, source: 'generated' as const }
  return { text: fallback, source: 'syllabus' as const }
}

function achievementTitleOf(naming: QuestNaming, fallback: string) {
  if (naming.achievementTitleOverride) return { text: naming.achievementTitleOverride, source: 'override' as const }
  if (naming.achievementTitle) return { text: naming.achievementTitle, source: 'generated' as const }
  return { text: fallback, source: 'syllabus' as const }
}

const NAME_SOURCE_COPY = {
  override: 'Your name',
  generated: 'Generated name',
  syllabus: 'Syllabus title'
} as const

/** Shows where a title came from in words, not only in colour. */
function NameSourceTag({ source }: { source: keyof typeof NAME_SOURCE_COPY }) {
  return <span className={`name-source ${source}`}>{NAME_SOURCE_COPY[source]}</span>
}

/**
 * How an edge meets a node here: it arrives on the diamond's top vertex, and
 * leaves from below the title and status captions — a line drawn straight down
 * from the bottom vertex would run through the middle of "MASTERED · 200 XP".
 * The route itself is `@shared/edgeRouting`, so the native chart bends the same
 * way this one does.
 */
const CHART_ROUTING: Routing = { axis: 'vertical', in: 46, out: 90, elbowMin: 12, arrow: 11 }

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#eee9df]">
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'gold' | 'muted' }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

/**
 * The rail on the left. Two shapes:
 *
 * - Expanded (250px): full labels, the pre-redesign look.
 * - Collapsed (56px): icons only, the drawio-style rail. Labels come back as
 *   native `title` tooltips on hover, so the choice never blocks a task.
 *
 * On a phone the rail is hidden entirely and returns as a drawer through the
 * `open` prop, ignoring `collapsed` — an icon rail on 375px steals space the
 * chart cannot spare.
 */
function Sidebar({
  route,
  setRoute,
  open,
  setOpen,
  collapsed,
  setCollapsed,
  courseXp,
  profile
}: {
  route: AppRoute
  setRoute: (r: AppRoute) => void
  open: boolean
  setOpen: (v: boolean) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  courseXp: CourseXpReadout
  profile: StudentProfile
}) {
  const initials = profile.fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'AR'

  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu />
      </button>
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <b>Cardinal Skill</b>
            <span>Mapúa mastery hub</span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close navigation">
            <X />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(item => (
            <button
              key={item.route}
              className={route === item.route ? 'active' : ''}
              onClick={() => { setRoute(item.route); setOpen(false) }}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
            >
              <item.icon />
              <span>{item.label}</span>
              {route === item.route && <ChevronRight />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            onClick={() => setRoute('profile')}
            title={collapsed ? 'Profile' : undefined}
            aria-label={collapsed ? 'Profile' : undefined}
          >
            <CircleUserRound />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setRoute('settings')}
            title={collapsed ? 'Settings' : undefined}
            aria-label={collapsed ? 'Settings' : undefined}
          >
            <Settings />
            <span>Settings</span>
          </button>
          <div className="student-chip">
            <div>{initials}</div>
            <p>
              <b>{profile.fullName}</b>
              <span>Level {courseXp.level} • {courseXp.earned.toLocaleString()} XP on this chart</span>
            </p>
          </div>
          {/* The rail-collapse control. Persists across reloads so the choice
              sticks. Hidden on mobile — the hamburger already owns that. */}
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand navigation labels' : 'Collapse navigation to icons only'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelRightOpen /> : <PanelLeftClose />}
            <span>Collapse</span>
          </button>
        </div>
      </aside>
      {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    </>
  )
}

/**
 * One confirm sheet for every "are you sure" on the chart — reset the layout,
 * lock the nodes again, add extra practice. Same shape, same keyboard
 * behaviour, one place to fix it.
 */
function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
  busy = false,
  error = null,
  destructive = false
}: {
  title: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  children: React.ReactNode
  busy?: boolean
  error?: string | null
  destructive?: boolean
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])

  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel() }}
    >
      <div className="confirm-sheet">
        <h2 id="confirm-title">{title}</h2>
        <div className="confirm-body">{children}</div>
        {error && <p className="confirm-error" role="alert">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="outline-action" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            ref={confirmRef}
            className={destructive ? 'primary-action destructive' : 'primary-action'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const MAX_TITLE = 80

/**
 * The quest title on the details panel, and the instructor's way to replace it.
 *
 * A typed title is tagged "Your name" and outlined in brass; a generated one is
 * tagged "Generated name". Regeneration skips a node that has either override,
 * so the only thing that removes one is "Use the generated name" below.
 *
 * Keyed by node id at the call site, so switching nodes drops any half-typed
 * edit instead of carrying it to the next node.
 */
function QuestNameBlock({
  nodeId,
  syllabusTitle,
  naming,
  onSave
}: {
  nodeId: string
  syllabusTitle: string
  naming?: QuestNaming
  onSave: (nodeId: string, patch: Pick<QuestNaming, 'titleOverride' | 'achievementTitleOverride'>) => void
}) {
  const quest = questTitleOf(naming, syllabusTitle)
  const achievement = naming ? achievementTitleOf(naming, '') : null
  const overridden = hasNameOverride(naming)

  const [editing, setEditing] = useState(false)
  const [questTitle, setQuestTitle] = useState(quest.text)
  const [achievementTitle, setAchievementTitle] = useState(achievement?.text ?? '')
  const [error, setError] = useState<string | null>(null)

  const startEdit = () => {
    setQuestTitle(quest.text)
    setAchievementTitle(achievement?.text ?? '')
    setError(null)
    setEditing(true)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const title = questTitle.trim()
    const badge = achievementTitle.trim()
    if (!title) {
      setError('Enter a quest title, or cancel to keep the current one.')
      return
    }
    if (title.length > MAX_TITLE || badge.length > MAX_TITLE) {
      setError(`Keep both titles under ${MAX_TITLE} characters, then save again.`)
      return
    }
    onSave(nodeId, { titleOverride: title, achievementTitleOverride: badge || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <form className="quest-name editing" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="quest-title-input">Quest title</label>
          <input
            id="quest-title-input"
            type="text"
            maxLength={MAX_TITLE}
            value={questTitle}
            onChange={e => setQuestTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label htmlFor="achievement-title-input">Achievement title</label>
          <input
            id="achievement-title-input"
            type="text"
            maxLength={MAX_TITLE}
            value={achievementTitle}
            onChange={e => setAchievementTitle(e.target.value)}
            placeholder="Leave empty to keep the generated badge"
          />
        </div>
        {error && <p className="confirm-error" role="alert">{error}</p>}
        <div className="quest-name-actions">
          <button type="button" className="outline-action" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="primary-action">Save titles</button>
        </div>
      </form>
    )
  }

  return (
    <div className={`quest-name ${quest.source}`}>
      <NameSourceTag source={quest.source} />
      <h2>{quest.text}</h2>
      {naming?.subtitle && <p className="quest-subtitle">{naming.subtitle}</p>}
      {quest.source !== 'syllabus' && (
        <p className="quest-syllabus">Syllabus skill: {syllabusTitle}</p>
      )}
      {achievement?.text && (
        <p className="quest-achievement">
          Achievement: <b>{achievement.text}</b> <NameSourceTag source={achievement.source} />
        </p>
      )}
      <div className="quest-name-actions">
        <button type="button" className="outline-action" onClick={startEdit}>
          <Pencil style={{ width: '14px', height: '14px' }} />
          Rename this quest
        </button>
        {overridden && (
          <button
            type="button"
            className="outline-action"
            onClick={() => onSave(nodeId, { titleOverride: null, achievementTitleOverride: null })}
          >
            <Undo2 style={{ width: '14px', height: '14px' }} />
            Use the generated name
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Stand-in for a real `mastered_at` timestamp. `shouldOfferHelp` only checks it
 * for truthiness, and this prototype records mastery as a set of ids with no
 * time attached.
 */
const MASTERED_MARK = '2026-01-01T00:00:00.000Z'

/** Fixed so a profile's simulated signals never change between renders. */
const LEARNER_SEED = 42

function SkillTree({
  payload,
  masteredIds,
  onToggleMastery,
  missions,
  onToggleMission,
  onResliceMissions,
  onRestoreMissionXp,
  focusSkillId,
  onFocusHandled,
  selectedDataset,
  onSelectDataset,
  onAskAICompanion,
  naming,
  onNamesGenerated,
  onSaveOverride,
  onCourseXp
}: {
  payload: SkillTreePayload
  masteredIds: Set<string>
  onToggleMastery: (skillId: string) => void
  missions: DomainMission[]
  onToggleMission: (missionId: string) => void
  onResliceMissions: (rewards: Record<string, number>) => void
  onRestoreMissionXp: () => void
  focusSkillId?: string | null
  onFocusHandled?: () => void
  selectedDataset: string
  onSelectDataset: (key: string) => void
  onAskAICompanion?: (context: AICompanionContext) => void
  naming: QuestNameMap
  onNamesGenerated: (names: QuestNaming[]) => void
  onSaveOverride: (nodeId: string, patch: Pick<QuestNaming, 'titleOverride' | 'achievementTitleOverride'>) => void
  onCourseXp: (xp: CourseXpReadout) => void
}) {
  const userId = 'usr_alex'
  const { course, nodes: syllabusNodes } = payload

  // 0. Supplemental help steps grafted onto the syllabus tree.
  // Session-only in this prototype: the real rows are written by the
  // `suggest-subtree` Edge Function and read back with the tree.
  const [helpNodes, setHelpNodes] = useState<DomainSkillNode[]>([])
  const [helpPatches, setHelpPatches] = useState<Record<string, { prerequisiteIds: string[] }>>({})

  useEffect(() => {
    setHelpNodes([])
    setHelpPatches({})
    // The steps are gone, so the XP they were carrying has to go back to the
    // missions it was carved out of. Dropping one without the other is how a
    // node quietly loses 40% of itself when you switch charts and come back.
    onRestoreMissionXp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id])

  const completedMissionIds = useMemo(
    () => new Set(missions.filter(m => m.status === 'completed').map(m => m.id)),
    [missions]
  )

  const rawNodes = useMemo(() => {
    if (helpNodes.length === 0) return syllabusNodes
    // The patch carries the parent's new edges to the terminal steps. It no
    // longer carries a redistributed `xpReward`: the parent's XP is the sum of
    // its missions, and those were re-sliced instead.
    return [
      ...syllabusNodes.map(n => (helpPatches[n.id] ? { ...n, ...helpPatches[n.id] } : n)),
      ...helpNodes
    ]
  }, [syllabusNodes, helpNodes, helpPatches])

  // 1. Graph Validation
  const validation = useMemo(() => validateSkillGraph(rawNodes), [rawNodes])

  // 2. Automatic Layout Calculation via Dagre engine (Compact Spacing)
  const autoLayoutResult = useMemo(() => {
    if (!validation.isValid) return { nodes: [], width: 960, height: 860 }
    return computeAutoLayout(rawNodes, { rankSep: 95, nodeSep: 75 })
  }, [rawNodes, validation.isValid])

  // 3. User Layout Persistence State
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [savedNotice, setSavedNotice] = useState(false)
  const [confirming, setConfirming] = useState<'reset' | 'static' | 'help' | null>(null)

  // Nodes are static until the student asks for them to be movable. Flipping
  // back to static shows the generated layout again; it never deletes the saved
  // arrangement, which is what "Reset layout" is for.
  const [movable, setMovable] = useState(false)

  // Load saved positions when course/dataset changes
  useEffect(() => {
    const saved = localStorageTreeLayoutAdapter.loadLayout(userId, course.id)
    if (saved && saved.positions) {
      setCustomPositions(saved.positions)
      setSavedNotice(true)
    } else {
      setCustomPositions({})
      setSavedNotice(false)
    }
  }, [userId, course.id])

  /**
   * A node's own XP: the sum of its missions.
   *
   * ponytail: falls back to the stored `xpReward` when a node has no missions.
   * Only CS210 carries missions today — the other five mock datasets and every
   * generated help step have none, and a chart that rendered every node as 0 XP
   * would be worse than a stale number. Delete the fallback once missions come
   * back with the tree instead of from a fixture.
   */
  const ownXp = useMemo(() => {
    return (node: { id: string; xpReward?: number }) =>
      missionsForNode(missions, node.id).length > 0
        ? nodeXpFromMissions(missions, node.id)
        : node.xpReward ?? 0
  }, [missions])

  /** The extra practice carved out of a node, by the node it was carved from. */
  const helpXpByParent = useMemo(() => {
    const byParent = new Map<string, { total: number; earned: number }>()
    for (const step of helpNodes) {
      if (!step.parentNodeId) continue
      const tally = byParent.get(step.parentNodeId) ?? { total: 0, earned: 0 }
      tally.total += step.xpReward ?? 0
      if (masteredIds.has(step.id)) tally.earned += step.xpReward ?? 0
      byParent.set(step.parentNodeId, tally)
    }
    return byParent
  }, [helpNodes, masteredIds])

  /**
   * What a node is worth to the student, and the number every readout shows.
   *
   * Its help steps count towards it, because their XP was taken out of its
   * missions rather than minted. That is what makes this figure survive a "need
   * extra help" request unchanged — the split moves, the total does not.
   */
  const totalXpOf = useMemo(() => {
    return (node: { id: string; xpReward?: number }) =>
      ownXp(node) + (helpXpByParent.get(node.id)?.total ?? 0)
  }, [ownXp, helpXpByParent])

  // Combine automatic layout positions with user custom position overrides.
  // Overrides only apply while nodes are movable, so switching back to static
  // restores the generated layout without touching what was saved.
  //
  // `xpReward` is replaced with the mission-derived figure here, once, so the
  // graph rules, the meter, and the chart all read the same number. It is the
  // node's *own* XP: its help steps are separate nodes in this list and would
  // otherwise be counted twice.
  const skills = useMemo(() => {
    return autoLayoutResult.nodes.map(node => {
      const customPos = movable ? customPositions[node.id] : undefined
      return {
        ...node,
        xpReward: ownXp(node),
        position: customPos ? customPos : node.position
      }
    })
  }, [autoLayoutResult.nodes, customPositions, movable, ownXp])

  const canvasWidth = autoLayoutResult.width
  const canvasHeight = autoLayoutResult.height

  const [selectedId, setSelectedId] = useState<string>('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(.65)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // Panel is docked and closed by default: the chart is the whole point of
  // opening this route. Clicking a node brings in the compact dock header —
  // clicking that opens the full panel. One extra click, and the chart is
  // clean on first paint the way `DESIGN.md` asks for.
  const [panelOpen, setPanelOpen] = useState(false)

  // Canvas Panning vs Node Dragging
  const [canvasDrag, setCanvasDrag] = useState<{ x: number; y: number; px: number; py: number } | null>(null)
  const [nodeDrag, setNodeDrag] = useState<{
    skillId: string
    startX: number
    startY: number
    initialX: number
    initialY: number
  } | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // A stale selection (dataset switched under us) gets cleared, but nothing is
  // auto-selected: the chart starts blank so the student's first act is a click.
  useEffect(() => {
    if (selectedId && skills.length > 0 && !skills.some(s => s.id === selectedId)) {
      setSelectedId('')
      setPanelOpen(false)
    }
  }, [skills, selectedId])

  const { status: calculatedStatusMap } = useMemo(() => deriveStatuses(skills, masteredIds), [skills, masteredIds])

  const selected = selectedId ? skills.find(s => s.id === selectedId) : undefined
  const currentStatus: SkillStatus = selected && masteredIds.has(selected.id)
    ? 'mastered'
    : (selected ? (calculatedStatusMap.get(selected.id) as SkillStatus) || 'locked' : 'locked')

  const selectedEligibility = useMemo(() => {
    if (!selected) return null
    return evaluateSkillUnlockState(selected.id, skills, masteredIds)
  }, [selected, skills, masteredIds])

  // ------------------------------------------------- the work inside the node
  // Missions are what the student actually does, so they lead the panel. The
  // node's progress is theirs: earned is what they finished, total is what the
  // node is worth, and mastery is finishing all of them.
  const selectedMissions = useMemo(
    () => (selected ? missionsForNode(missions, selected.id) : []),
    [missions, selected]
  )
  const selectedHelpXp = (selected && helpXpByParent.get(selected.id)) || { total: 0, earned: 0 }
  const nodeTotal = selected ? totalXpOf(selected) : 0
  const nodeEarned = selected
    ? nodeXpEarned(missions, selected.id, completedMissionIds) + selectedHelpXp.earned
    : 0
  const nodePct = nodeTotal > 0 ? Math.round((nodeEarned / nodeTotal) * 100) : 0
  const missionsLeft = selectedMissions.filter(m => !completedMissionIds.has(m.id)).length
  /** The one mission worth pointing at, so only one control on the panel is cardinal. */
  const nextMissionId = selectedMissions.find(m => !completedMissionIds.has(m.id))?.id

  // ---------------------------------------------------------- adaptive engine
  // This prototype has no telemetry, so the engine is fed by a simulated
  // learner. The picker below is how the five profiles get demonstrated.
  const [profileId, setProfileId] = useState<LearnerProfileId>('steady')

  const sharedTree = useMemo(() => treeFromSkills(skills), [skills])
  const helpParentIds = useMemo(
    () => new Set(helpNodes.map(n => n.parentNodeId).filter(Boolean) as string[]),
    [helpNodes]
  )

  const signals = useMemo(
    () => generateSignals(LEARNER_PROFILES[profileId], sharedTree, LEARNER_SEED),
    [profileId, sharedTree]
  )

  /**
   * The profile decides how much effort a node took; this app decides what is
   * mastered and what already has help. Merging both keeps the engine from
   * offering a scaffold on a node the student just finished.
   */
  const signalFor = useMemo(() => {
    const byId = new Map(signals.nodeSignals.map(s => [s.nodeId, s]))
    return (id: string): NodeSignal | null => {
      const signal = byId.get(id)
      if (!signal) return null
      return {
        ...signal,
        helpRequested: helpParentIds.has(id),
        masteredAt: masteredIds.has(id) ? MASTERED_MARK : null
      }
    }
  }, [signals, helpParentIds, masteredIds])

  const nodeById = useMemo(() => new Map(sharedTree.nodes.map(n => [n.id, n])), [sharedTree])

  /** Nodes the engine wants to scaffold, so the chart can say so before you click. */
  const offeredHelpIds = useMemo(() => {
    const offered = new Set<string>()
    for (const node of sharedTree.nodes) {
      if (node.graded === false) continue
      const signal = signalFor(node.id)
      if (signal && shouldOfferHelp(signal, node).offer) offered.add(node.id)
    }
    return offered
  }, [sharedTree, signalFor])

  const selectedOffer = useMemo(() => {
    if (!selected) return null
    const node = nodeById.get(selected.id)
    const signal = signalFor(selected.id)
    return node && signal ? shouldOfferHelp(signal, node) : null
  }, [selected, nodeById, signalFor])

  const mode = useMemo(() => learnerMode(sharedTree, signals), [sharedTree, signals])
  const nextUp = useMemo(
    () => rankNextQuests(sharedTree, masteredIds, signals, 3),
    [sharedTree, masteredIds, signals]
  )
  const pace = paceTarget(signals)
  const xpPerLevel = personalXpPerLevel(signals)

  // ------------------------------------------------------------- the XP meter
  // One readout, shared with the dashboard header, the sidebar, and the profile
  // page. They all show the same level because they all read this.
  const courseXp = useMemo(() => readCourseXp(skills, masteredIds, xpPerLevel), [skills, masteredIds, xpPerLevel])
  useEffect(() => { onCourseXp(courseXp) }, [courseXp, onCourseXp])

  const breakdown = courseXp
  // What the syllabus alone is worth. Fragmentation conserves XP, so this must
  // stay equal to `breakdown.available` no matter how many subtrees exist.
  const syllabusXp = useMemo(() => totalXp(treeFromSkills(syllabusNodes).nodes), [syllabusNodes])
  const level = courseXp.level
  const levelPct = courseXp.pct
  const xpToNextLevel = courseXp.toNextLevel

  // ------------------------------------------------------- extra help request
  const [helpBusy, setHelpBusy] = useState(false)
  const [helpError, setHelpError] = useState<string | null>(null)

  const isSupplemental = selected?.graded === false
  const selectedHasHelp = selected ? helpParentIds.has(selected.id) : false
  const canRequestHelp = Boolean(selected) && !isSupplemental && !selectedHasHelp && currentStatus !== 'mastered'

  const handleConfirmHelp = async () => {
    if (!selected) return
    setHelpBusy(true)
    setHelpError(null)
    try {
      const steps = await requestHelpSubtree(selected.id, selected.title)
      const sharedParent = treeFromSkills([selected]).nodes[0]

      // `buildHelpSubtree` is used for structure only — the step ids, the chain
      // of prerequisites between them, and the edge from the terminal step back
      // to the parent. Every XP number it produced is thrown away below: it
      // splits the node's stored `xpReward`, and a node's XP is now the sum of
      // its missions, so that number is no longer the one being shared out.
      const subtree = buildHelpSubtree(sharedParent, steps, key => `help_${key}`)

      // The real split. `fragmentMissionXp` guarantees
      // sum(missionRewards) + sum(stepRewards) === sum(the mission XP going in),
      // so the node is worth exactly what it was worth a moment ago.
      const own = missionsForNode(missions, selected.id)
      const { missionRewards, stepRewards } = fragmentMissionXp(
        own.map(m => m.xpReward),
        subtree.nodes.length
      )

      const graft = graftHelpSubtree(selected, {
        ...subtree,
        nodes: subtree.nodes.map((step, i) => ({ ...step, xpReward: stepRewards[i] ?? 0 }))
      })

      setHelpNodes(prev => [...prev, ...graft.nodes])
      // `graft.parentPatch.xpReward` is deliberately dropped. Only the new
      // prerequisite edges are applied; the parent's XP follows its missions.
      setHelpPatches(prev => ({
        ...prev,
        [graft.parentPatch.id]: { prerequisiteIds: graft.parentPatch.prerequisiteIds }
      }))
      onResliceMissions(Object.fromEntries(own.map((m, i) => [m.id, missionRewards[i] ?? 0])))
      setConfirming(null)
    } catch {
      setHelpError('Couldn’t build the extra practice steps. Try again in a moment.')
    } finally {
      setHelpBusy(false)
    }
  }

  // ------------------------------------------------------- quest naming
  const [namingBusy, setNamingBusy] = useState(false)
  const [namingNote, setNamingNote] = useState<string | null>(null)
  const [namingError, setNamingError] = useState<string | null>(null)

  const namedCount = skills.filter(s => naming[s.id]).length

  const handleGenerateNames = async () => {
    setNamingBusy(true)
    setNamingError(null)
    setNamingNote(null)
    try {
      // The ids an instructor has renamed are sent as the skip list, which is
      // how the Edge Function's `title_override` filter behaves. Regeneration
      // cannot reach a node the instructor has already named.
      const overridden = skills.filter(s => hasNameOverride(naming[s.id])).map(s => s.id)
      const result = await nameQuests(course.id, skills, overridden)
      onNamesGenerated(result.names)
      setNamingNote(
        result.skipped > 0
          ? `Named ${result.names.length} quests. Kept ${result.skipped} you renamed.`
          : `Named ${result.names.length} quests.`
      )
    } catch (e) {
      setNamingError(
        e instanceof Error ? e.message : 'Couldn’t name these quests. Try again in a moment.'
      )
    } finally {
      setNamingBusy(false)
    }
  }

  const focusAndSelectNode = (targetId: string) => {
    const target = skills.find(s => s.id === targetId)
    if (!target) return
    setSelectedId(targetId)
    setZoom(1.0)
    setPan({
      x: Math.round((canvasWidth / 2) - target.position.x),
      y: Math.round((canvasHeight / 2) - target.position.y)
    })
    setPanelOpen(true)
  }

  // Deep link from the missions overview. `skills` is in the dependency list
  // because the chart loads a render or two after the route changes, and the
  // node cannot be selected before it exists.
  useEffect(() => {
    if (!focusSkillId || !skills.some(s => s.id === focusSkillId)) return
    focusAndSelectNode(focusSkillId)
    onFocusHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSkillId, skills])

  const statusCopy: Record<SkillStatus, string> = {
    mastered: 'Mastered',
    in_progress: 'In progress',
    available: 'Available',
    locked: 'Locked'
  }

  /**
   * How far the student is through a node, 0–1. This is what fills the edges
   * that lead into it: an edge is the run towards its node, and the red part of
   * it is how much of that node is already banked.
   *
   * Mastery short-circuits the arithmetic because five of the six mock datasets
   * carry no missions at all — without it every edge in them would read as
   * untouched no matter how much the student had finished.
   */
  const progressInto = useMemo(() => {
    return (node: { id: string; xpReward?: number }) => {
      if (masteredIds.has(node.id)) return 1
      const total = totalXpOf(node)
      if (total <= 0) return 0
      const earned =
        nodeXpEarned(missions, node.id, completedMissionIds) +
        (helpXpByParent.get(node.id)?.earned ?? 0)
      return Math.min(1, Math.max(0, earned / total))
    }
  }, [masteredIds, totalXpOf, missions, completedMissionIds, helpXpByParent])

  const edgeCrossbars = useMemo(
    () => crossbarByPrereq(
      skills.map(s => ({ id: s.id, x: s.position.x, y: s.position.y })),
      skills.flatMap(s => (s.prerequisiteIds || []).map(from => ({ from, to: s.id }))),
      CHART_ROUTING
    ),
    [skills]
  )

  const selectedPathEdges = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const set = new Set<string>()
    const visit = (id: string) => {
      const node = skills.find(s => s.id === id)
      if (!node) return
      (node.prerequisiteIds || []).forEach(p => {
        set.add(`${p}->${id}`)
        visit(p)
      })
    }
    visit(selectedId)
    return set
  }, [skills, selectedId])

  const hoveredPathEdges = useMemo(() => {
    if (!hoveredId) return new Set<string>()
    const set = new Set<string>()
    skills.forEach(s => {
      (s.prerequisiteIds || []).forEach(p => {
        if (p === hoveredId || s.id === hoveredId) {
          set.add(`${p}->${s.id}`)
        }
      })
    })
    return set
  }, [skills, hoveredId])

  const persistPositions = (newPositions: Record<string, { x: number; y: number }>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const payload: UserTreeLayout = {
        userId,
        courseId: course.id,
        version: 1,
        updatedAt: new Date().toISOString(),
        positions: newPositions
      }
      localStorageTreeLayoutAdapter.saveLayout(payload)
      setSavedNotice(true)
    }, 400)
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomDelta = -e.deltaY * 0.0012
      setZoom(z => Math.min(1.5, Math.max(0.35, z + zoomDelta)))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // The one place that answers "what zoom shows the whole chart?". A hardcoded
  // 0.62 clipped the taller redesigned viewport at both ends, and the fit and
  // mount paths were reaching different answers.
  const computeFitZoom = () => {
    const el = viewportRef.current
    if (!el || canvasWidth === 0 || canvasHeight === 0) return null
    const vw = el.clientWidth
    const vh = el.clientHeight
    if (vw === 0 || vh === 0) return null
    return Math.max(0.35, Math.min(1.5, Math.min(vw / canvasWidth, vh / canvasHeight) * 0.9))
  }

  // Fit-on-mount and course-switch. The viewport is not measured on the first
  // effect tick — clientWidth is 0 until layout finishes — and a single rAF
  // is not always enough on a slow first paint. Retry until it works, cap at
  // ~500ms, and let a ResizeObserver keep the fit honest if the viewport
  // ever resizes afterwards (collapsing the rail, opening the details dock).
  useEffect(() => {
    if (canvasWidth === 0 || canvasHeight === 0) return
    let cancelled = false
    let raf = 0
    let tries = 0
    const attempt = () => {
      if (cancelled) return
      const ratio = computeFitZoom()
      if (ratio !== null) {
        setZoom(ratio)
        setPan({ x: 0, y: 0 })
        return
      }
      tries += 1
      if (tries < 30) raf = requestAnimationFrame(attempt)
    }
    raf = requestAnimationFrame(attempt)

    // After the initial fit lands, watch the viewport so a rail collapse or
    // window resize triggers a re-fit. Debounced through rAF to coalesce bursts.
    const el = viewportRef.current
    let resizeRaf = 0
    const observer = el
      ? new ResizeObserver(() => {
          cancelAnimationFrame(resizeRaf)
          resizeRaf = requestAnimationFrame(() => {
            const ratio = computeFitZoom()
            if (ratio !== null) {
              setZoom(ratio)
              setPan({ x: 0, y: 0 })
            }
          })
        })
      : null
    if (observer && el) observer.observe(el)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(resizeRaf)
      observer?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, canvasWidth, canvasHeight])

  const fit = () => {
    const ratio = computeFitZoom()
    if (ratio !== null) setZoom(ratio)
    setPan({ x: 0, y: 0 })
  }
  const reset = () => { setZoom(1.0); setPan({ x: 0, y: 0 }) }
  const focusSelected = () => {
    if (!selected) return
    setZoom(1.0)
    setPan({ x: Math.round((canvasWidth / 2) - selected.position.x), y: Math.round((canvasHeight / 2) - selected.position.y) })
    setPanelOpen(true)
  }

  const masteredCount = skills.filter(s => masteredIds.has(s.id)).length
  const hasCustomLayout = Object.keys(customPositions).length > 0

  // The floating "Chart tools" popover on the tool cluster. State kept here
  // because opening it should feel instant — no separate mount, no fetch.
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!toolsOpen) return
    const onDown = (e: MouseEvent) => {
      if (!toolsRef.current) return
      if (!toolsRef.current.contains(e.target as Node)) setToolsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setToolsOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [toolsOpen])

  /** Back to the generated layout. Non-destructive: the arrangement is kept. */
  const showGeneratedLayout = () => {
    setMovable(false)
    setConfirming(null)
    setZoom(.62)
    setPan({ x: 0, y: 0 })
  }

  const handleToggleMovable = () => {
    if (movable) {
      // Their arrangement is about to disappear from the screen. It is only
      // hidden, not deleted, but a student who spent time on it deserves to be
      // told that before it happens.
      if (hasCustomLayout) { setConfirming('static'); return }
      showGeneratedLayout()
      return
    }
    setMovable(true)
  }

  /** The only thing that deletes a saved arrangement. */
  const handleConfirmReset = () => {
    setCustomPositions({})
    localStorageTreeLayoutAdapter.clearLayout(userId, course.id)
    setSavedNotice(false)
    showGeneratedLayout()
  }

  const dockShown = Boolean(selected) && !panelOpen
  const explorerClass = panelOpen ? 'panel-open' : (dockShown ? 'panel-docked' : 'panel-hidden')

  return (
    <div className={`tree-explorer ${explorerClass}`}>
      <section className="tree-card">
        <div
          ref={viewportRef}
          className={`tree-viewport ${canvasDrag || nodeDrag ? 'dragging' : ''}`}
          onPointerDown={e => {
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('select')) return
            setCanvasDrag({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y })
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={e => {
            if (canvasDrag) {
              setPan({ x: canvasDrag.px + e.clientX - canvasDrag.x, y: canvasDrag.py + e.clientY - canvasDrag.y })
            } else if (nodeDrag) {
              const dx = (e.clientX - nodeDrag.startX) / zoom
              const dy = (e.clientY - nodeDrag.startY) / zoom
              const nextX = Math.round(nodeDrag.initialX + dx)
              const nextY = Math.round(nodeDrag.initialY + dy)

              const updated = {
                ...customPositions,
                [nodeDrag.skillId]: { x: nextX, y: nextY }
              }
              setCustomPositions(updated)
              persistPositions(updated)
            }
          }}
          onPointerUp={e => {
            setCanvasDrag(null)
            if (nodeDrag) {
              setNodeDrag(null)
            }
          }}
          onPointerCancel={() => { setCanvasDrag(null); setNodeDrag(null) }}
        >
          <div className="canvas-hint">
            Drag canvas to pan • {movable ? 'Drag nodes to arrange them' : 'Nodes are static — switch to movable to arrange them'} • Scroll to zoom
          </div>

          {!validation.isValid ? (
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '12px' }}>
              <AlertTriangle style={{ width: '48px', height: '48px', color: '#981e2f' }} />
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Graph Validation Error</h2>
              <p style={{ color: 'var(--muted-foreground)', maxWidth: '500px', textAlign: 'center' }}>
                The uploaded syllabus or API response contains invalid graph data.
              </p>
              {validation.errors.map((err, i) => (
                <div key={i} style={{ background: '#981e2f12', border: '1px solid #981e2f44', borderRadius: '10px', padding: '12px 16px', maxWidth: '500px', textAlign: 'left' }}>
                  <b style={{ color: '#981e2f', display: 'block' }}>{err.message}</b>
                  <span style={{ fontSize: '12px', color: 'var(--foreground)' }}>{err.details}</span>
                </div>
              ))}
            </div>
          ) : skills.length === 0 ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-foreground)' }}>
              Upload a syllabus to generate your learning pathway.
            </div>
          ) : (
            <div
              className="tree-canvas"
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                margin: `-${canvasHeight / 2}px 0 0 -${canvasWidth / 2}px`,
                transform: `translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`
              }}
            >
              {skills.map((skill) => {
                const nodeStatus: SkillStatus = masteredIds.has(skill.id)
                  ? 'mastered'
                  : (calculatedStatusMap.get(skill.id) as SkillStatus) || 'locked'

                const Icon = iconMap[skill.icon || 'code'] || Code2
                const isBeingDragged = nodeDrag?.skillId === skill.id
                const supplemental = skill.graded === false
                // Badged whatever the status. A plateaued learner's one stuck node
                // is often still locked behind the thing they are stuck on, and
                // hiding the badge there loses the case that matters most.
                const helpOffered = offeredHelpIds.has(skill.id)
                const kindCopy = supplemental ? 'Extra practice, not graded' : 'Graded skill'
                // What the node is worth, extra practice included. Requesting
                // help re-slices this number without changing it.
                const nodeXp = totalXpOf(skill)

                return (
                  <div
                    key={skill.id}
                    className={`skill-wrap ${isBeingDragged ? 'dragging' : ''}`}
                    style={{
                      left: `${skill.position.x}px`,
                      top: `${skill.position.y}px`
                    }}
                    onPointerDown={e => {
                      if ((e.target as HTMLElement).tagName === 'BUTTON') return
                      // Static nodes: let the event through so the canvas pans.
                      if (!movable) return
                      e.stopPropagation()
                      setNodeDrag({
                        skillId: skill.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        initialX: skill.position.x,
                        initialY: skill.position.y
                      })
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                  >
                    <button
                      className={`skill-node ${nodeStatus} ${supplemental ? 'supplemental' : ''} ${selected?.id === skill.id ? 'selected' : ''}`}
                      onClick={() => { setSelectedId(skill.id); setPanelOpen(true) }}
                      onMouseEnter={() => setHoveredId(skill.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      aria-label={`${skill.title}, ${statusCopy[nodeStatus]}, ${kindCopy}, ${nodeXp} XP${helpOffered ? '. Extra practice is offered on this skill' : ''}`}
                      aria-pressed={selected?.id === skill.id}
                    >
                      <Icon />
                      {nodeStatus === 'locked' && <Lock className="lock" />}
                      {nodeStatus === 'mastered' && <CheckCircle2 className="lock" style={{ color: '#eab308' }} />}
                    </button>
                    <span>{skill.shortTitle || skill.title}</span>
                    <small>{supplemental ? `Extra practice • ${statusCopy[nodeStatus]}` : statusCopy[nodeStatus]} • {nodeXp} XP</small>
                    {helpOffered && <em>Extra help offered</em>}
                  </div>
                )
              })}

              <svg className="links" aria-hidden="true" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                {skills.flatMap(targetNode => {
                  const targetPos = targetNode.position
                  const prereqs = targetNode.prerequisiteIds || []

                  return prereqs.map((prereqId, pIdx) => {
                    const sourceNode = skills.find(s => s.id === prereqId)
                    if (!sourceNode) return null
                    const sourcePos = sourceNode.position

                    const points = edgeWaypoints(sourcePos, targetPos, CHART_ROUTING, edgeCrossbars.get(prereqId))
                    const pathData = orthogonalPath(points)
                    const bends = bendsOf(points, 2 * CHART_ROUTING.elbowMin)

                    // The edge is a progress bar for the node it runs into.
                    const progress = progressInto(targetNode)
                    const fractions = waypointFractions(points)

                    const edgeKey = `${sourceNode.id}->${targetNode.id}`
                    const isSelectedEdge = selectedPathEdges.has(edgeKey)
                    const isHoveredEdge = hoveredPathEdges.has(edgeKey)
                    const isHighlighted = isSelectedEdge || isHoveredEdge

                    const strokeOpacity = (selectedId || hoveredId)
                      ? (isHighlighted ? 1.0 : 0.22)
                      : 0.9

                    const dotR = (progress > 0 ? 4 : 3) + (isHighlighted ? 1 : 0)
                    /** Red once the fill has reached this far along the run. */
                    const reached = (fraction: number) => (fraction <= progress ? 'edge-fill' : 'edge-track')

                    return (
                      <g
                        key={edgeKey}
                        className={isHighlighted ? 'highlighted' : ''}
                        style={{ opacity: strokeOpacity }}
                      >
                        <path className="edge-track" d={pathData} />
                        {progress > 0 && (
                          // pathLength normalises the run to 1, so the dash can
                          // be written as the fraction earned without measuring
                          // the geometry.
                          <path
                            className="edge-fill"
                            d={pathData}
                            pathLength={1}
                            strokeDasharray={`${progress} 1`}
                          />
                        )}
                        {/* Every prerequisite's edge arrives on the same port,
                            so one arrowhead per edge stacks four of them on one
                            tip and reads as a blot. The node gets one, drawn by
                            its first edge; they would all be identical anyway,
                            down to the colour, since they share a target. */}
                        {pIdx === 0 && (
                          <polygon
                            className={reached(1)}
                            points={arrowheadPoints(points, CHART_ROUTING.arrow ?? 11)}
                          />
                        )}
                        {bends.map((bend, bIdx) => (
                          <circle
                            key={bIdx}
                            className={reached(fractions[points.indexOf(bend)] ?? 1)}
                            cx={bend.x}
                            cy={bend.y}
                            r={dotR}
                          />
                        ))}
                      </g>
                    )
                  })
                })}
              </svg>
            </div>
          )}

          <div className="tree-minimap" aria-hidden="true">
            {skills.map(s => {
              const mx = (s.position.x / canvasWidth) * 100
              const my = (s.position.y / canvasHeight) * 100
              const isMastered = masteredIds.has(s.id)
              return (
                <i
                  key={s.id}
                  style={{
                    left: `${mx}%`,
                    top: `${my}%`,
                    backgroundColor: isMastered ? '#981e2f' : '#ded4c4'
                  }}
                />
              )
            })}
          </div>

          {/* ---------------------------------------- floating tool cluster
              Chart-configuration controls that used to sit in a full toolbar
              row above the canvas. Everything textual folds behind the Chart
              tools popover; the movable switch stays visible because it is
              the one control a student flips mid-look. */}
          <div className="tool-cluster" ref={toolsRef}>
            <button
              type="button"
              className={`tool-cluster-more ${toolsOpen ? 'is-open' : ''}`}
              onClick={() => setToolsOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              aria-label="Chart tools"
              title="Chart tools"
            >
              <MoreHorizontal />
              <span>Chart tools</span>
            </button>

            {/* Movable/static switch keeps a slot on the cluster: it is the
                one action that visibly reshapes the chart, and hiding it
                behind a popover makes moving nodes a chore.
                display/place-items overrides live in globals.css so the
                switch's knob is not centred like an icon button — see the
                fix that made the switch stop parking mid-track. */}
            <span className="tree-switch">
              <span aria-hidden="true">Movable nodes</span>
              <button
                type="button"
                role="switch"
                aria-checked={movable}
                aria-label="Movable nodes"
                className={movable ? 'on' : ''}
                onClick={handleToggleMovable}
              >
                <i />
              </button>
            </span>

            {movable && (
              <button
                type="button"
                className="tool-cluster-btn"
                onClick={handleToggleMovable}
                title="Show the generated layout"
                aria-label="Auto-arrange the chart"
              >
                <RotateCcw /> <span>Auto-arrange</span>
              </button>
            )}

            {toolsOpen && (
              <div className="tool-menu" role="menu">
                <div className="tool-menu-title">Chart</div>
                <label className="tool-menu-field">
                  <span>Dataset</span>
                  <select
                    value={selectedDataset}
                    onChange={e => onSelectDataset(e.target.value)}
                    aria-label="Chart dataset"
                  >
                    <option value="cs210">CS210 Branching (16 skills)</option>
                    <option value="linear">CS101 Linear (6 skills)</option>
                    <option value="wide">CS300 Wide Realm (25 skills)</option>
                    <option value="dual-roots">MATH201 Dual Roots (4 skills)</option>
                    <option value="err-missing">Invalid: Missing Prereq</option>
                    <option value="err-cycle">Invalid: Cycle Loop</option>
                  </select>
                </label>
                <label className="tool-menu-field">
                  <span>Learner (dev)</span>
                  <select
                    value={profileId}
                    onChange={e => setProfileId(e.target.value as LearnerProfileId)}
                    aria-label="Simulated learner profile"
                  >
                    {ALL_PROFILES.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </label>

                <div className="tool-menu-divider" role="separator" />
                <div className="tool-menu-title">Names</div>
                <button
                  type="button"
                  className="tool-menu-item"
                  onClick={handleGenerateNames}
                  disabled={namingBusy || skills.length === 0}
                  aria-label={namedCount > 0 ? 'Rename unnamed quests' : 'Name the quests on this chart'}
                >
                  <Sparkles />
                  {namingBusy ? 'Naming quests…' : namedCount > 0 ? 'Regenerate names' : 'Name quests'}
                </button>
                {namingNote && !namingError && (
                  <p className="tool-menu-note" role="status">{namingNote}</p>
                )}
                {namingError && (
                  <p className="tool-menu-note error" role="alert">{namingError}</p>
                )}

                <div className="tool-menu-divider" role="separator" />
                <div className="tool-menu-title">Layout</div>
                {hasCustomLayout ? (
                  <button
                    type="button"
                    className="tool-menu-item destructive"
                    onClick={() => { setToolsOpen(false); setConfirming('reset') }}
                    aria-label="Reset the saved arrangement to the generated layout"
                  >
                    <Undo2 /> Reset saved arrangement
                  </button>
                ) : (
                  <p className="tool-menu-note">Move a node to save your own arrangement.</p>
                )}
                {savedNotice && hasCustomLayout && (
                  <p className="tool-menu-note saved"><Check /> Layout saved</p>
                )}

                <div className="tool-menu-divider" role="separator" />
                <div className="tool-menu-title">Your pace</div>
                <p className="tool-menu-note">
                  <b>{pace} {pace === 1 ? 'node' : 'nodes'}/week</b> · Level every <b>{xpPerLevel} XP</b> ·
                  {' '}Order: <b>{mode === 'struggling' ? 'shortest first' : mode === 'fast' ? 'opens the most' : 'syllabus order'}</b>
                </p>
              </div>
            )}
          </div>

          {/* ---------------------------------------- floating zoom cluster
              Zoom, fit, focus, reset. All view-only, so they sit apart from
              the tool cluster and stay quiet in the corner. */}
          <div className="zoom-cluster">
            <button type="button" onClick={() => setZoom(z => Math.max(.35, z - .1))} aria-label="Zoom out"><ZoomOut /></button>
            <b>{Math.round(zoom * 100)}%</b>
            <button type="button" onClick={() => setZoom(z => Math.min(1.5, z + .1))} aria-label="Zoom in"><ZoomIn /></button>
            <span className="zoom-cluster-divider" aria-hidden="true" />
            <button type="button" onClick={fit} title="Fit skill tree" aria-label="Fit skill tree"><Maximize2 /></button>
            <button type="button" onClick={reset} title="Reset view" aria-label="Reset view"><RefreshCw /></button>
            <button type="button" onClick={focusSelected} title="Focus selected skill" aria-label="Focus selected skill" disabled={!selected}><Search /></button>
          </div>

          {/* ---------------------------------------- chart status footer
              The one persistently visible strip of text, over the canvas at
              the bottom. Every readout the student used to see across an XP
              band and an adaptive strip is here — meter, split, conservation,
              next up chips — but on one line and without page chrome. */}
          {validation.isValid && skills.length > 0 && (
            <div className="chart-footer" role="region" aria-label="Chart status">
              <div className="chart-footer-row primary">
                <span className="chart-footer-course">
                  <Pill>{course.code}</Pill>
                  <b>{course.title}</b>
                  <span className="chart-footer-count">{skills.length} skills · {masteredCount} mastered</span>
                </span>
                <span className="chart-footer-level"><b>Level {level}</b></span>
                <span
                  className="meter-track"
                  role="progressbar"
                  aria-valuenow={levelPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Level ${level}, ${levelPct}% of the way to level ${level + 1}`}
                >
                  <i style={{ width: `${levelPct}%` }} />
                </span>
                <span className="chart-footer-xp">
                  <b>{breakdown.earned.toLocaleString()}</b> / {breakdown.available.toLocaleString()} XP
                  <span className="chart-footer-next-lvl"> · {xpToNextLevel.toLocaleString()} to L{level + 1}</span>
                </span>
                <span className="chart-footer-next">
                  <span className="chart-footer-next-lbl">Next up:</span>
                  {nextUp.length === 0 ? (
                    <span className="chart-footer-empty">Nothing available yet.</span>
                  ) : nextUp.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      className="chart-footer-chip"
                      onClick={() => focusAndSelectNode(n.id)}
                      aria-label={`Go to ${n.title}, ${totalXpOf(n)} XP`}
                    >
                      {n.title}
                    </button>
                  ))}
                </span>
              </div>
              <div className="chart-footer-row meta">
                <span className="chart-footer-split">
                  Graded {breakdown.graded.earned}/{breakdown.graded.available} XP · Extra practice {breakdown.supplemental.earned}/{breakdown.supplemental.available} XP
                </span>
                <span className={breakdown.available === syllabusXp ? 'chart-footer-conserved' : 'chart-footer-off'}>
                  {breakdown.available === syllabusXp
                    ? `Chart total ${syllabusXp.toLocaleString()} XP — unchanged by extra practice`
                    : `Chart total ${breakdown.available.toLocaleString()} XP — the syllabus is worth ${syllabusXp.toLocaleString()} XP`}
                </span>
                <span className="chart-footer-legend" aria-label="Node legend">
                  <span><i className="mastered" />Mastered</span>
                  <span><i className="active" />In progress</span>
                  <span><i className="available" />Available</span>
                  <span><i className="locked" />Locked</span>
                  <span><i className="supplemental" />Extra practice</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Collapsed dock header — appears only when a node is selected and the
          panel is closed. Clicking it opens the full panel; the small X
          alongside clears the selection so the dock disappears. */}
      {dockShown && selected && (
        <button
          type="button"
          className="detail-dock"
          onClick={() => setPanelOpen(true)}
          aria-label={`Open details for ${selected.title}`}
          aria-expanded={false}
        >
          <div className={`detail-icon ${currentStatus}`}>
            {(() => { const I = iconMap[selected.icon || 'code'] || Code2; return <I /> })()}
          </div>
          <div className="detail-dock-body">
            <span className="detail-dock-title">{selected.title}</span>
            <span className="detail-dock-sub">
              {statusCopy[currentStatus]} · {totalXpOf(selected).toLocaleString()} XP
            </span>
          </div>
          <ChevronLeft className="detail-dock-chev" aria-hidden="true" />
          <span
            role="button"
            tabIndex={0}
            className="detail-dock-dismiss"
            onClick={e => { e.stopPropagation(); setSelectedId('') }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setSelectedId('') } }}
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X />
          </span>
        </button>
      )}

      <aside className="detail-card" aria-hidden={!panelOpen} style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {selected && selectedEligibility ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className={`detail-icon ${currentStatus}`}>
                  {(() => { const I = iconMap[selected.icon || 'code'] || Code2; return <I /> })()}
                </div>
                <Pill tone={currentStatus === 'mastered' ? 'gold' : currentStatus === 'locked' ? 'muted' : 'default'}>
                  {statusCopy[currentStatus]}
                </Pill>
              </div>
              <button className="panel-close" onClick={() => setPanelOpen(false)} aria-label="Close skill details">
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            <QuestNameBlock
              key={selected.id}
              nodeId={selected.id}
              syllabusTitle={selected.title}
              naming={naming[selected.id]}
              onSave={onSaveOverride}
            />

            {/* The missions are the node. They lead the panel because they are
                the only thing here a student can act on right now; the syllabus
                description and the prerequisites are reference and sit below. */}
            {selectedMissions.length > 0 && (
              <section className="node-missions" aria-labelledby="node-missions-title">
                <div className="node-missions-head">
                  <h3 id="node-missions-title">Missions</h3>
                  <b>{nodeEarned.toLocaleString()} of {nodeTotal.toLocaleString()} XP</b>
                </div>

                <span
                  className="meter-track"
                  role="progressbar"
                  aria-valuenow={nodePct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${selected.title}: ${nodeEarned} of ${nodeTotal} XP earned`}
                >
                  <i style={{ width: `${nodePct}%` }} />
                </span>

                <p className="node-missions-note">
                  {currentStatus === 'locked'
                    ? `Locked — ${selectedEligibility.blockedReason ?? 'master the prerequisites below first.'}`
                    : missionsLeft === 0
                      ? 'Every mission is done, so this skill is mastered.'
                      : `${missionsLeft} of ${selectedMissions.length} missions left. Finishing all of them masters this skill.`}
                </p>

                {selectedHelpXp.total > 0 && (
                  <p className="node-missions-note">
                    Extra practice holds {selectedHelpXp.total.toLocaleString()} XP of this total. Finish those
                    steps on the chart to earn it — the skill is still worth {nodeTotal.toLocaleString()} XP.
                  </p>
                )}

                <ul className="mission-list">
                  {selectedMissions.map(m => {
                    const done = completedMissionIds.has(m.id)
                    const blocked = !done && currentStatus === 'locked'
                    return (
                      <li key={m.id} className={`mission-row ${done ? 'done' : ''}`}>
                        <div className="mission-row-body">
                          <b>{m.title}</b>
                          <p>{m.description}</p>
                          <span className="mission-row-meta">
                            <span>{m.type}</span>
                            <span>{m.difficulty}</span>
                            <span>{m.durationMinutes} min</span>
                            <b>{m.xpReward.toLocaleString()} XP</b>
                          </span>
                          {/* State in words, never only in colour or a tick. */}
                          <span className={`mission-state ${done ? 'done' : ''}`}>
                            {done ? <Check aria-hidden="true" /> : null}
                            {done ? 'Marked complete' : blocked ? 'Locked' : 'Not complete'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={m.id === nextMissionId && !blocked ? 'primary-action' : 'outline-action'}
                          onClick={() => onToggleMission(m.id)}
                          disabled={blocked}
                          aria-label={done ? `Undo ${m.title}` : `Mark complete: ${m.title}`}
                        >
                          {done ? <Undo2 aria-hidden="true" /> : null}
                          {done ? 'Undo' : 'Mark complete'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/* Adaptive help offer. The engine's main job, so it sits above the
                mastery action rather than at the bottom of the panel. */}
            <div className={`help-offer ${selectedOffer?.offer ? 'offered' : ''}`}>
              <div className="help-offer-head">
                <HelpCircle style={{ width: '15px', height: '15px' }} />
                <b>{selectedOffer?.offer ? 'Extra practice would help here' : 'Extra practice'}</b>
              </div>
              <p>
                {isSupplemental
                  ? 'This is a supplemental step. It is not graded, and it carries part of the XP of the skill it scaffolds.'
                  : selectedOffer?.reason ?? 'Break this skill into smaller steps if it is not landing.'}
              </p>
              {!isSupplemental && (
                <button
                  type="button"
                  className={selectedOffer?.offer ? 'primary-action' : 'outline-action'}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => { setHelpError(null); setConfirming('help') }}
                  disabled={!canRequestHelp}
                >
                  <HelpCircle style={{ width: '15px', height: '15px' }} />
                  Need extra help
                </button>
              )}
            </div>

            {/* The mastery action for a node that has no missions of its own:
                every help step, and the five mock datasets that were authored
                before missions existed. Where missions do exist, the list above
                is the only way through the node — one skill must not have two
                different ways to be finished. */}
            {selectedMissions.length === 0 && (
            <div className="progress-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>
                  {currentStatus === 'mastered' ? 'Skill Mastered' : currentStatus === 'locked' ? 'Pathway Locked' : 'Skill Progress'}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)' }}>
                  {currentStatus === 'mastered' ? '100% complete' : currentStatus === 'available' ? 'Ready to start' : currentStatus === 'in_progress' ? '45% complete' : 'Prerequisites required'}
                </span>
              </div>

              <Progress value={currentStatus === 'mastered' ? 100 : currentStatus === 'in_progress' ? 45 : currentStatus === 'available' ? 0 : 0} />

              {currentStatus === 'mastered' ? (
                <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '10px', padding: '12px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <CheckCircle2 style={{ width: '18px', height: '18px', color: '#eab308' }} />
                    <b style={{ fontSize: '13px', color: 'var(--foreground)' }}>Skill Mastered!</b>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '0 0 10px' }}>
                    You earned <b>{nodeTotal.toLocaleString()} XP</b> for mastering this learning outcome.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="outline-action"
                      style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }}
                      onClick={() => onToggleMastery(selected.id)}
                    >
                      Review skill
                    </button>
                    <button
                      className="primary-action"
                      style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }}
                      onClick={() => {
                        onAskAICompanion?.({
                          courseId: course.id,
                          courseTitle: course.title,
                          skillId: selected.id,
                          skillTitle: selected.title,
                          description: selected.description,
                          learningObjective: selected.learningObjective,
                          difficulty: selected.difficultyLabel || 'Intermediate',
                          status: currentStatus,
                          prerequisites: selectedEligibility.completedPrerequisites.map(p => p.title)
                        })
                      }}
                    >
                      <Sparkles style={{ width: '14px', height: '14px' }} />
                      Ask AI to review
                    </button>
                  </div>
                </div>
              ) : currentStatus === 'locked' ? (
                <div style={{ background: 'rgba(152, 30, 47, 0.06)', border: '1px solid rgba(152, 30, 47, 0.2)', borderRadius: '10px', padding: '12px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Lock style={{ width: '16px', height: '16px', color: '#981e2f' }} />
                    <b style={{ fontSize: '13px', color: '#981e2f' }}>Locked Pathway</b>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--foreground)', margin: '0 0 12px', lineHeight: 1.4 }}>
                    {selectedEligibility.blockedReason || 'Complete the required skills below to unlock this pathway.'}
                  </p>

                  <button
                    className="primary-action"
                    disabled
                    aria-disabled="true"
                    style={{ width: '100%', opacity: 0.6, cursor: 'not-allowed', justifyContent: 'center' }}
                  >
                    <Lock style={{ width: '14px', height: '14px' }} />
                    Complete prerequisites to unlock
                  </button>

                  {selectedEligibility.nextRecommendedPrerequisiteId && (
                    <button
                      onClick={() => focusAndSelectNode(selectedEligibility.nextRecommendedPrerequisiteId!)}
                      className="outline-action"
                      style={{ width: '100%', marginTop: '8px', justifyContent: 'center', fontSize: '12px' }}
                    >
                      View next prerequisite
                      <ChevronRight style={{ width: '14px', height: '14px' }} />
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
                    Mastering this skill earns <b>+{nodeTotal.toLocaleString()} XP</b> towards your level progression.
                  </p>
                  <button
                    className="primary-action"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => onToggleMastery(selected.id)}
                  >
                    {currentStatus === 'in_progress' ? 'Complete skill mission' : 'Start skill & master'}
                    <ChevronRight style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Prerequisites section */}
            <div className="prereqs-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Prerequisites</h3>
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                  {selectedEligibility.completedPrerequisites.length} of {selectedEligibility.totalPrerequisites} mastered
                </span>
              </div>

              {selectedEligibility.totalPrerequisites === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>
                  No prerequisites required. This is a foundational skill.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedEligibility.completedPrerequisites.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(22, 163, 74, 0.08)', borderRadius: '8px', border: '1px solid rgba(22, 163, 74, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 style={{ width: '14px', height: '14px', color: '#16a34a' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{p.title}</span>
                      </div>
                      <button
                        onClick={() => focusAndSelectNode(p.id)}
                        style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                      >
                        View
                      </button>
                    </div>
                  ))}
                  {selectedEligibility.incompletePrerequisites.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock style={{ width: '14px', height: '14px', color: '#981e2f' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{p.title}</span>
                      </div>
                      <button
                        onClick={() => focusAndSelectNode(p.id)}
                        style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                      >
                        View prerequisite
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reference: what the syllabus says about this node. Below the
                work, because it does not change what the student does next. */}
            <div className="overview-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {selected.moduleName && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {selected.moduleName}
                </span>
              )}
              <p style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: 'var(--muted-foreground)' }}>
                {selected.description || 'Master this outcome to unlock advanced challenges in your syllabus path.'}
              </p>

              {selected.learningObjective && (
                <div style={{ background: 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: '10px', marginTop: '4px' }}>
                  <b style={{ fontSize: '10px', textTransform: 'uppercase', display: 'block', color: 'var(--primary)', marginBottom: '2px', letterSpacing: '0.05em' }}>
                    What you will learn
                  </b>
                  <span style={{ fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.4 }}>{selected.learningObjective}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '6px', fontSize: '12px' }}>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block' }}>Difficulty</span>
                  <b style={{ color: 'var(--foreground)' }}>
                    {selected.difficultyLabel || (selected.difficulty === 1 ? 'Foundational' : selected.difficulty === 3 ? 'Advanced' : 'Intermediate')}
                  </b>
                </div>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block' }}>Worth</span>
                  <b style={{ color: '#eab308', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Zap style={{ width: '13px', height: '13px' }} /> {nodeTotal.toLocaleString()} XP
                  </b>
                </div>
                {selected.estimatedMinutes && (
                  <div>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block' }}>Est. Time</span>
                    <b style={{ color: 'var(--foreground)' }}>{selected.estimatedMinutes} min</b>
                  </div>
                )}
              </div>
            </div>

            {/* AI Study Companion Launcher */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: 'auto' }}>
              <button
                className="outline-action"
                style={{ width: '100%', justifyContent: 'center', gap: '6px', background: 'var(--card)' }}
                onClick={() => {
                  onAskAICompanion?.({
                    courseId: course.id,
                    courseTitle: course.title,
                    skillId: selected.id,
                    skillTitle: selected.title,
                    description: selected.description,
                    learningObjective: selected.learningObjective,
                    difficulty: selected.difficultyLabel || 'Intermediate',
                    status: currentStatus,
                    prerequisites: selectedEligibility.incompletePrerequisites.map(p => p.title)
                  })
                }}
              >
                <Sparkles style={{ width: '15px', height: '15px', color: 'var(--primary)' }} />
                Ask AI Companion
              </button>
              <span style={{ display: 'block', fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '6px', lineHeight: 1.3 }}>
                The AI Companion supports your learning and does not complete graded work for you.
              </span>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted-foreground)', padding: '20px', textAlign: 'center' }}>Select a node to inspect details</div>
        )}
      </aside>

      {confirming === 'reset' && (
        <ConfirmDialog
          title="Reset your chart arrangement?"
          confirmLabel="Reset layout"
          destructive
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirmReset}
        >
          <p>
            This deletes the arrangement you saved and returns every node to the generated
            layout. Your progress and XP are not affected.
          </p>
        </ConfirmDialog>
      )}

      {confirming === 'static' && (
        <ConfirmDialog
          title="Make nodes static again?"
          confirmLabel="Make nodes static"
          onCancel={() => setConfirming(null)}
          onConfirm={showGeneratedLayout}
        >
          <p>
            The chart goes back to the generated layout. Your arrangement is kept — switch nodes
            to movable again and it returns exactly as you left it.
          </p>
          <p>Only “Reset layout” deletes it.</p>
        </ConfirmDialog>
      )}

      {confirming === 'help' && selected && (
        <ConfirmDialog
          title={`Add extra practice to ${selected.title}?`}
          confirmLabel="Add extra practice"
          busy={helpBusy}
          error={helpError}
          onCancel={() => { setHelpError(null); setConfirming(null) }}
          onConfirm={handleConfirmHelp}
        >
          <ul>
            <li>Smaller supplemental steps are added under this skill to scaffold it.</li>
            <li>They are not graded. Your course is worth exactly what it was worth before.</li>
            <li>
              This skill’s {nodeTotal.toLocaleString()} XP is shared out across its missions and the
              new steps, not added to — up to {Math.round(HELP_SHARE * 100)}% moves down to the
              steps and the missions keep the rest. The skill stays worth {nodeTotal.toLocaleString()} XP.
            </li>
            <li>The steps become prerequisites, so finish them to unlock this skill again.</li>
          </ul>
        </ConfirmDialog>
      )}
    </div>
  )
}

function PageHead({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="page-head">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{copy}</span>
      </div>
      <button className="icon-button" aria-label="Notifications">
        <Bell /><i />
      </button>
    </header>
  )
}

function Stat({ icon: Icon, value, label, progress }: { icon: LucideIcon; value: string; label: string; progress?: number }) {
  return (
    <article className="stat-card">
      <div><Icon /></div>
      <p><b>{value}</b><span>{label}</span></p>
      {progress !== undefined && <Progress value={progress} />}
    </article>
  )
}

function Dashboard({
  masteredIds,
  courseXp,
  streakDays,
  onToggleMastery,
  missions,
  onToggleMission,
  onResliceMissions,
  onRestoreMissionXp,
  focusSkillId,
  onFocusHandled,
  onAskAICompanion,
  naming,
  onNamesGenerated,
  onSaveOverride,
  onCourseXp
}: {
  masteredIds: Set<string>
  courseXp: CourseXpReadout
  streakDays: number
  onToggleMastery: (skillId: string) => void
  missions: DomainMission[]
  onToggleMission: (missionId: string) => void
  onResliceMissions: (rewards: Record<string, number>) => void
  onRestoreMissionXp: () => void
  focusSkillId?: string | null
  onFocusHandled?: () => void
  onAskAICompanion?: (context: AICompanionContext) => void
  naming: QuestNameMap
  onNamesGenerated: (names: QuestNaming[]) => void
  onSaveOverride: (nodeId: string, patch: Pick<QuestNaming, 'titleOverride' | 'achievementTitleOverride'>) => void
  onCourseXp: (xp: CourseXpReadout) => void
}) {
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string>('cs210')
  const [payload, setPayload] = useState<SkillTreePayload | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  // A deep link from the missions overview names a skill, not a chart.
  // ponytail: every fixture mission belongs to CS210, so that is the chart to
  // open. Once missions come back with their tree, the mission carries the
  // course and this line reads it instead of assuming.
  useEffect(() => {
    if (focusSkillId) setSelectedDatasetKey('cs210')
  }, [focusSkillId])

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    getSkillTree(selectedDatasetKey).then(data => {
      if (isMounted) {
        setPayload(data)
        setLoading(false)
      }
    })
    return () => { isMounted = false }
  }, [selectedDatasetKey])

  // The eyebrow, display heading, stats row, and section-title are gone on
  // this route: everything they carried is now on the chart's own footer or
  // inside the sidebar's active state. The chart is the whole screen.
  return (
    <div className="dashboard-page dashboard-page--tree">
      {loading || !payload ? (
        <div className="tree-loading" role="status">
          <RefreshCw className="animate-spin" style={{ width: '32px', height: '32px', color: 'var(--primary)' }} />
          <b>Loading syllabus skill tree…</b>
        </div>
      ) : (
        <SkillTree
          payload={payload}
          masteredIds={masteredIds}
          onToggleMastery={onToggleMastery}
          missions={missions}
          onToggleMission={onToggleMission}
          onResliceMissions={onResliceMissions}
          onRestoreMissionXp={onRestoreMissionXp}
          focusSkillId={focusSkillId}
          onFocusHandled={onFocusHandled}
          selectedDataset={selectedDatasetKey}
          onSelectDataset={setSelectedDatasetKey}
          onAskAICompanion={onAskAICompanion}
          naming={naming}
          onNamesGenerated={onNamesGenerated}
          onSaveOverride={onSaveOverride}
          onCourseXp={onCourseXp}
        />
      )}
    </div>
  )
}

/**
 * Everything outstanding, across the charts, in one list.
 *
 * Read-only on purpose. A mission counts towards the XP of the skill it belongs
 * to, so it is completed on that skill in the chart, where the student can see
 * what it moves. Two places to finish the same mission is two places to keep in
 * step, and one of them would eventually be wrong.
 */
function Missions({
  missions,
  onOpenSkill
}: {
  missions: DomainMission[]
  onOpenSkill: (skillId: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const list = missions.filter(m => filter === 'all' || m.status === filter)

  // ponytail: one chart's titles, because every mission in the fixture belongs
  // to CS210. When missions arrive with the tree they carry their own course,
  // and this map becomes a lookup over whatever is loaded.
  const skillTitle = (skillId: string) =>
    mockCS210Payload.nodes.find(n => n.id === skillId)?.title ?? skillId

  return (
    <>
      <PageHead
        eyebrow="Quest log"
        title="Missions"
        copy="Every mission across your charts. Open one on its skill to mark it complete — that is where the XP lands."
      />
      <div className="filter-row">
        {['all', 'in-progress', 'available', 'completed'].map(f => (
          <button className={filter === f ? 'active' : ''} onClick={() => setFilter(f)} key={f}>
            {f.replace('-', ' ')}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="mission-empty">Nothing here yet — pick another filter, or open a skill on the chart to start one.</p>
      ) : (
        <div className="card-grid">
          {list.map(m => (
            <article className="mission-card" key={m.id}>
              <div>
                <Pill tone={m.status === 'completed' ? 'gold' : 'default'}>{m.status.replace('-', ' ')}</Pill>
                <Pill tone="muted">{m.type}</Pill>
              </div>
              <h2>{m.title}</h2>
              <span className="mission-skill">Part of {skillTitle(m.skillId)}</span>
              <p>{m.description}</p>
              <footer>
                <span>{m.durationMinutes} min • {m.xpReward.toLocaleString()} XP</span>
                <button
                  onClick={() => onOpenSkill(m.skillId)}
                  aria-label={`Open ${skillTitle(m.skillId)} in the skill tree`}
                >
                  Open in skill tree
                  <ChevronRight />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  )
}

function Universal() {
  const tracks = [
    ['Professional communication', 72, 'Present ideas with clarity and confidence.'],
    ['Critical thinking', 58, 'Evaluate evidence and make sound decisions.'],
    ['Leadership & teamwork', 44, 'Collaborate across disciplines and perspectives.'],
    ['Digital citizenship', 81, 'Build responsibly in an interconnected world.']
  ]
  return (
    <>
      <PageHead eyebrow="Beyond the classroom" title="Universal skills" copy="Transferable capabilities that strengthen every degree and career path." />
      <div className="track-grid">
        {tracks.map(([title, p, copy], i) => (
          <article className="track-card" key={String(title)}>
            <div className="track-number">0{i + 1}</div>
            <h2>{title}</h2>
            <p>{copy}</p>
            <Progress value={Number(p)} />
            <span>{p}% mastery</span>
            <button>Explore track<ChevronRight /></button>
          </article>
        ))}
      </div>
    </>
  )
}

function Companion({
  context,
  onClearContext
}: {
  context?: AICompanionContext | null
  onClearContext?: () => void
}) {
  const defaultGreeting = context?.skillTitle
    ? `I can help you understand ${context.skillTitle}. Would you like a concept explanation, a study plan, or a practice question?`
    : 'Hi Alex — I can help you unpack a concept, plan a study session, or reflect on a mission.'

  const [messages, setMessages] = useState<string[]>([defaultGreeting])
  const [input, setInput] = useState('')

  useEffect(() => {
    if (context?.skillTitle) {
      setMessages([
        `I can help you understand ${context.skillTitle}. Would you like a concept explanation, a study plan, or a practice question?`
      ])
    }
  }, [context])

  const sendText = (textToSend: string) => {
    if (!textToSend.trim()) return
    const userQuery = textToSend.trim()
    const queryLower = userQuery.toLowerCase()

    let responseText = 'A useful place to start is to map the concept to what you already mastered. Want a guided example or a short practice question?'

    if (queryLower.includes('answer') || queryLower.includes('solution for test') || queryLower.includes('cheat') || queryLower.includes('solve my exam') || queryLower.includes('graded')) {
      responseText = 'The AI Companion supports your learning and does not complete graded work for you. I can explain the underlying concepts, provide practice problems, or give hints, but you must complete graded assignments yourself.'
    } else if (context?.skillTitle) {
      if (queryLower.includes('explain') || queryLower.includes('simply')) {
        responseText = `Explanation for ${context.skillTitle}: ${context.learningObjective || context.description || 'Focus on core principles and breakdown of the outcome.'}`
      } else if (queryLower.includes('plan') || queryLower.includes('prepare')) {
        responseText = `Study plan for ${context.skillTitle}: 1) Review prerequisites (${context.prerequisites?.join(', ') || 'Foundation'}). 2) Work through guided practice. 3) Attempt the skill mission.`
      } else if (queryLower.includes('quiz') || queryLower.includes('questions')) {
        responseText = `Practice Question for ${context.skillTitle}: What is the primary advantage or trade-off of this computational technique? Explain the step-by-step logic in your own words!`
      } else if (queryLower.includes('first')) {
        responseText = context.prerequisites && context.prerequisites.length > 0
          ? `Focus on mastering these unfinished prerequisites first: ${context.prerequisites.join(', ')}.`
          : `Since all prerequisites are mastered for ${context.skillTitle}, you are eligible to start this skill directly!`
      }
    }

    setMessages(prev => [...prev, userQuery, responseText])
    setInput('')
  }

  const quickPrompts = context?.skillTitle
    ? [
        `Explain ${context.skillTitle} simply`,
        `Help me prepare`,
        `Create a study plan`,
        `Quiz me with practice questions`,
        `What should I complete first?`
      ]
    : ['Explain recursion simply', 'Plan my week', 'Quiz me on trees']

  return (
    <>
      <PageHead eyebrow="Study support" title="Cardinal companion" copy="A reflective learning partner grounded in your current skill path." />
      <div className="chat-card">
        <div className="chat-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="chat-avatar"><Bot /></div>
            <p>
              <b>Cardinal AI Companion</b>
              <span>
                {context?.skillTitle ? `Context: ${context.skillTitle} (${context.courseTitle || 'CS210'})` : 'Learning companion • Online'}
              </span>
            </p>
          </div>
          {context?.skillTitle && (
            <button onClick={onClearContext} className="outline-action" style={{ fontSize: '11px', padding: '4px 8px' }}>
              Clear context
            </button>
          )}
        </div>
        <div className="messages">
          {messages.map((m, i) => (
            <div className={i % 2 ? 'user' : 'bot'} key={i}>{m}</div>
          ))}
        </div>
        <div className="suggestions" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {quickPrompts.map(x => (
            <button key={x} onClick={() => sendText(x)}>{x}</button>
          ))}
        </div>
        <div className="composer">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendText(input) }}
            placeholder={`Ask about ${context?.skillTitle || 'your learning path'}…`}
          />
          <button onClick={() => sendText(input)}>Send</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
          <ShieldCheck style={{ width: '15px', height: '15px', color: 'var(--primary)', flexShrink: 0 }} />
          <span>The AI Companion supports your learning and does not complete graded work for you.</span>
        </div>
      </div>
    </>
  )
}

function Achievements({
  naming,
  masteredIds
}: {
  naming: QuestNameMap
  masteredIds: Set<string>
}) {
  // One badge per named quest. The title is the instructor's if they typed one,
  // otherwise the generated one, and the tag says which.
  const questBadges = Object.values(naming)
  const unlockedQuests = questBadges.filter(n => masteredIds.has(n.nodeId)).length
  const milestoneUnlocked = prototypeData.achievements.filter(a => a.unlockedAt).length
  const total = questBadges.length + prototypeData.achievements.length

  return (
    <>
      <PageHead eyebrow="Milestones" title="Achievements" copy="A record of your momentum, consistency, and academic growth." />
      <div className="achievement-hero">
        <Trophy />
        <div>
          <Pill tone="gold">{unlockedQuests + milestoneUnlocked} of {total} unlocked</Pill>
          <h2>Your effort is becoming expertise.</h2>
          <p>
            {questBadges.length === 0
              ? 'Name the quests on your chart and every skill earns a badge you can rename.'
              : 'Master a skill and its badge unlocks. Rename any badge from the skill details panel.'}
          </p>
        </div>
      </div>
      {questBadges.length > 0 && (
        <>
          <div className="section-title">
            <div>
              <p>From your chart</p>
              <h2>Quest badges</h2>
            </div>
            <Pill tone="muted">{unlockedQuests} of {questBadges.length} unlocked</Pill>
          </div>
          <div className="card-grid">
            {questBadges.map(n => {
              const unlocked = masteredIds.has(n.nodeId)
              const badge = achievementTitleOf(n, n.nodeId)
              return (
                <article className={`achievement-card ${unlocked ? '' : 'locked'}`} key={n.nodeId}>
                  <div>{unlocked ? <Award /> : <Lock />}</div>
                  <NameSourceTag source={badge.source} />
                  <h2>{badge.text}</h2>
                  <p>{n.achievementDescription}</p>
                  <span>{unlocked ? 'Unlocked' : 'Still hidden'}</span>
                </article>
              )
            })}
          </div>
        </>
      )}
      <div className="section-title">
        <div>
          <p>Across your term</p>
          <h2>Milestones</h2>
        </div>
      </div>
      <div className="card-grid">
        {prototypeData.achievements.map(a => (
          <article className={`achievement-card ${a.unlockedAt ? '' : 'locked'}`} key={a.id}>
            <div>{a.unlockedAt ? <Award /> : <Lock />}</div>
            <Pill tone={a.rarity === 'epic' ? 'gold' : 'muted'}>{a.rarity}</Pill>
            <h2>{a.title}</h2>
            <p>{a.description}</p>
            <span>{a.unlockedAt ? 'Unlocked' : 'Still hidden'}</span>
          </article>
        ))}
      </div>
    </>
  )
}

/**
 * Two ways to build a chart, one pipeline.
 *
 * The AI parser and the instructor produce the same node shape and hand it to
 * the same three steps: `validateSkillGraph`, then `computeAutoLayout`, then
 * publish. A tree an instructor typed by hand can fail on a cycle or a dangling
 * prerequisite exactly like the model's output can, and it is reported the same
 * way. There is no weaker second path.
 */
type SyllabusMode = 'choose' | 'ai' | 'manual'

const NODE_KINDS: { value: NodeKind; label: string }[] = [
  { value: 'topic', label: 'Topic' },
  { value: 'reading', label: 'Reading' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'project', label: 'Project' }
]

const MAX_NODE_XP = 2000

interface NodeFormState {
  title: string
  description: string
  kind: NodeKind
  xpReward: string
  prerequisiteIds: string[]
}

const emptyNodeForm: NodeFormState = {
  title: '',
  description: '',
  kind: 'topic',
  xpReward: '150',
  prerequisiteIds: []
}

/** Slug from the title, kept unique against the ids already in the draft. */
function nodeIdFrom(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'node'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/**
 * The chart the pipeline produced, drawn from `computeAutoLayout`'s own
 * coordinates. Not a second renderer: dots and hairlines only, enough to show
 * that the layout ran and where the roots are.
 */
function LayoutPreview({ layout }: { layout: ReturnType<typeof computeAutoLayout> }) {
  const positions = new Map(layout.nodes.map(n => [n.id, n.position]))
  const edges = layout.nodes.flatMap(n =>
    (n.prerequisiteIds || [])
      .filter(p => positions.has(p))
      .map(p => ({ key: `${p}->${n.id}`, from: positions.get(p)!, to: n.position }))
  )

  return (
    <svg
      className="layout-preview"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`Chart preview: ${layout.nodes.length} ${layout.nodes.length === 1 ? 'node' : 'nodes'} and ${edges.length} prerequisite ${edges.length === 1 ? 'link' : 'links'}, laid out top to bottom.`}
    >
      {edges.map(e => (
        <line key={e.key} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} />
      ))}
      {layout.nodes.map(n => (
        <circle key={n.id} cx={n.position.x} cy={n.position.y} r={18} />
      ))}
    </svg>
  )
}

function Syllabus({ onPublishSyllabus }: { onPublishSyllabus: () => void }) {
  const [mode, setMode] = useState<SyllabusMode>('choose')
  const [draft, setDraft] = useState<DomainSkillNode[]>([])
  const [published, setPublished] = useState(false)

  // AI path
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Manual path
  const [form, setForm] = useState<NodeFormState>(emptyNodeForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // ------------------------------------------------------------- the pipeline
  // Both paths land here. Same validator, same layout engine, same publish.
  const validation = useMemo(() => validateSkillGraph(draft), [draft])
  const layout = useMemo(
    () => (validation.isValid && draft.length > 0 ? computeAutoLayout(draft, { rankSep: 95, nodeSep: 75 }) : null),
    [draft, validation.isValid]
  )
  const draftXp = draft.reduce((sum, n) => sum + (n.xpReward ?? 0), 0)

  const handleFile = (f: File) => {
    const sizeMB = (f.size / (1024 * 1024)).toFixed(1)
    setSelectedFile({ name: f.name, size: `${sizeMB} MB` })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleAnalyze = () => {
    setAnalyzing(true)
    // ponytail: the parse is mocked with the CS210 dataset, so the AI path
    // hands the review step a real node list instead of a spinner and a promise.
    // The real one is `supabase/functions/parse-syllabus`; swapping it in
    // changes this call and nothing downstream of it.
    setTimeout(() => {
      setAnalyzing(false)
      setDraft(mockCS210Payload.nodes)
    }, 1200)
  }

  const startNewNode = () => {
    setEditingId(null)
    setForm(emptyNodeForm)
    setFormError(null)
  }

  const startEditNode = (node: DomainSkillNode) => {
    setEditingId(node.id)
    setForm({
      title: node.title,
      description: node.description ?? '',
      kind: node.kind ?? 'topic',
      xpReward: String(node.xpReward ?? 150),
      prerequisiteIds: node.prerequisiteIds ?? []
    })
    setFormError(null)
  }

  const submitNode = (e: React.FormEvent) => {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setFormError('Enter a title for this node, then add it again.')
      return
    }
    const xp = Number(form.xpReward)
    if (!Number.isInteger(xp) || xp < 1 || xp > MAX_NODE_XP) {
      setFormError(`Enter a whole XP reward between 1 and ${MAX_NODE_XP}.`)
      return
    }

    setFormError(null)
    if (editingId) {
      setDraft(prev => prev.map(n => n.id === editingId
        ? { ...n, title, description: form.description.trim(), kind: form.kind, xpReward: xp, prerequisiteIds: form.prerequisiteIds }
        : n))
    } else {
      const id = nodeIdFrom(title, new Set(draft.map(n => n.id)))
      setDraft(prev => [...prev, {
        id,
        title,
        description: form.description.trim(),
        kind: form.kind,
        xpReward: xp,
        prerequisiteIds: form.prerequisiteIds,
        status: 'available',
        progress: 0
      }])
    }
    setEditingId(null)
    setForm(emptyNodeForm)
  }

  const deleteNode = (id: string) => {
    // Prerequisite references to the deleted node are left alone on purpose:
    // that is a dangling reference, and `validateSkillGraph` below names it in
    // the review step the same way it names one the parser produced.
    setDraft(prev => prev.filter(n => n.id !== id))
    if (editingId === id) startNewNode()
  }

  const togglePrereq = (id: string) => {
    setForm(prev => ({
      ...prev,
      prerequisiteIds: prev.prerequisiteIds.includes(id)
        ? prev.prerequisiteIds.filter(p => p !== id)
        : [...prev.prerequisiteIds, id]
    }))
  }

  const handlePublish = () => {
    setPublished(true)
    onPublishSyllabus()
  }

  const startOver = () => {
    setMode('choose')
    setDraft([])
    setPublished(false)
    setSelectedFile(null)
    setAnalyzing(false)
    startNewNode()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const step = published ? 4 : draft.length > 0 ? 3 : mode === 'choose' ? 1 : 2
  const steps = ['Choose how to start', 'Add outcomes', 'Review the chart', 'Publish the pathway']

  return (
    <div className="import-page-container">
      <PageHead
        eyebrow="COURSE SETUP WORKFLOW"
        title="Build your skill tree"
        copy="Let the parser read a syllabus, or lay the nodes out yourself. Both go through the same checks before anything is published."
      />

      <div className="import-stepper-bar" aria-label="Course setup progression">
        {steps.map((label, i) => (
          <Fragment key={label}>
            {i > 0 && <div className="step-divider" />}
            <div className={`step-item ${step >= i + 1 ? 'active' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
              <i className="step-num">{i + 1}</i>
              <span>{label}</span>
            </div>
          </Fragment>
        ))}
      </div>

      <div className="import-grid">
        <section className="import-card">
          {mode === 'choose' && (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 800 }}>How do you want to start?</h2>
              <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
                Both routes produce the same nodes, run the same graph checks, and use the same
                auto-layout. Pick whichever you have to hand.
              </p>
              <div className="mode-choice">
                <button type="button" className="mode-card" onClick={() => setMode('ai')}>
                  <Sparkles />
                  <b>Parse a syllabus with AI</b>
                  <span>Upload a PDF or DOCX and let the parser pull out outcomes and prerequisites.</span>
                </button>
                <button type="button" className="mode-card" onClick={() => { setMode('manual'); startNewNode() }}>
                  <Plus />
                  <b>Build the tree myself</b>
                  <span>Add each node by hand and set which ones come first. Same fields, same checks.</span>
                </button>
              </div>
            </>
          )}

          {mode === 'ai' && draft.length === 0 && (
            <>
              {!selectedFile ? (
                <div
                  className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileChange}
                    aria-label="Upload syllabus file"
                  />
                  <div className="dropzone-icon-box">
                    <UploadCloud />
                  </div>
                  <h2 className="dropzone-title">Drop your syllabus here</h2>
                  <p className="dropzone-sub">
                    Upload your official course syllabus to automatically extract learning outcomes, modules, and prerequisites.
                  </p>
                  <div className="format-pills">
                    <Pill tone="muted">PDF</Pill>
                    <Pill tone="muted">DOCX</Pill>
                    <Pill tone="muted">Max 10 MB</Pill>
                  </div>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp style={{ width: '16px', height: '16px' }} />
                    Choose a file
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="file-selected-box">
                    <div className="file-icon-badge">
                      <FileText style={{ width: '24px', height: '24px' }} />
                    </div>
                    <div className="file-details">
                      <b>{selectedFile.name}</b>
                      <span>{selectedFile.size} • Ready for AI extraction</span>
                    </div>
                    <Pill tone="default">Ready</Pill>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="primary-action"
                      disabled={analyzing}
                      onClick={handleAnalyze}
                      style={{ flex: 1 }}
                    >
                      {analyzing ? (
                        <>
                          <RefreshCw className="animate-spin" style={{ width: '16px', height: '16px' }} />
                          Extracting outcomes…
                        </>
                      ) : (
                        <>
                          <Sparkles style={{ width: '16px', height: '16px' }} />
                          Analyze and generate skill tree
                          <ChevronRight style={{ width: '16px', height: '16px' }} />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className="outline-action"
                      onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    >
                      Choose a different file
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'manual' && (
            <>
              <div className="section-title" style={{ margin: 0 }}>
                <div>
                  <p>{draft.length} {draft.length === 1 ? 'node' : 'nodes'} • {draftXp.toLocaleString()} XP</p>
                  <h2>Your nodes</h2>
                </div>
              </div>

              {draft.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
                  No nodes yet — add the first outcome below and it becomes the root of the chart.
                </p>
              ) : (
                <ul className="draft-node-list">
                  {draft.map(n => (
                    <li key={n.id} className={editingId === n.id ? 'editing' : ''}>
                      <div>
                        <b>{n.title}</b>
                        <span>
                          {NODE_KINDS.find(k => k.value === n.kind)?.label ?? 'Topic'} • {n.xpReward} XP •{' '}
                          {n.prerequisiteIds.length === 0
                            ? 'no prerequisites'
                            : `after ${n.prerequisiteIds.map(p => draft.find(d => d.id === p)?.title ?? p).join(', ')}`}
                        </span>
                      </div>
                      <button type="button" className="outline-action" onClick={() => startEditNode(n)} aria-label={`Edit ${n.title}`}>
                        <Pencil style={{ width: '14px', height: '14px' }} />
                        Edit
                      </button>
                      <button type="button" className="outline-action" onClick={() => deleteNode(n.id)} aria-label={`Delete ${n.title}`}>
                        <Trash2 style={{ width: '14px', height: '14px' }} />
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* noValidate: the browser's own bubble would win on the XP field
                  and leave the empty-title case unreported. One validator, one
                  message, announced as an alert. */}
              <form className="node-form" onSubmit={submitNode} noValidate>
                <h3 style={{ fontSize: '14px', fontWeight: 800 }}>
                  {editingId ? 'Edit this node' : 'Add a node'}
                </h3>

                <div className="form-group">
                  <label htmlFor="node-title">Title</label>
                  <input
                    id="node-title"
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Recursion and induction"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="node-description">Description</label>
                  <textarea
                    id="node-description"
                    rows={2}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="What a student can do once they finish this node."
                  />
                </div>

                <div className="node-form-row">
                  <div className="form-group">
                    <label htmlFor="node-kind">Kind</label>
                    <select
                      id="node-kind"
                      value={form.kind}
                      onChange={e => setForm({ ...form, kind: e.target.value as NodeKind })}
                    >
                      {NODE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="node-xp">XP reward</label>
                    <input
                      id="node-xp"
                      type="number"
                      min={1}
                      max={MAX_NODE_XP}
                      value={form.xpReward}
                      onChange={e => setForm({ ...form, xpReward: e.target.value })}
                    />
                  </div>
                </div>

                <fieldset className="prereq-picker">
                  <legend>Prerequisites</legend>
                  {draft.filter(n => n.id !== editingId).length === 0 ? (
                    <p>Nothing to depend on yet. The first node has no prerequisites.</p>
                  ) : (
                    draft.filter(n => n.id !== editingId).map(n => (
                      <label key={n.id}>
                        <input
                          type="checkbox"
                          checked={form.prerequisiteIds.includes(n.id)}
                          onChange={() => togglePrereq(n.id)}
                        />
                        {n.title}
                      </label>
                    ))
                  )}
                </fieldset>

                {formError && <p className="confirm-error" role="alert">{formError}</p>}

                <div className="quest-name-actions">
                  {editingId && (
                    <button type="button" className="outline-action" onClick={startNewNode}>Cancel edit</button>
                  )}
                  <button type="submit" className="primary-action">
                    <Plus style={{ width: '15px', height: '15px' }} />
                    {editingId ? 'Save this node' : 'Add this node'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* -------------------------------------------------- review, both paths */}
          {draft.length > 0 && (
            <div className="review-block">
              <div className="section-title" style={{ margin: 0 }}>
                <div>
                  <p>{mode === 'manual' ? 'Built by you' : 'Extracted by the parser'}</p>
                  <h2>Review the chart</h2>
                </div>
                <Pill tone={published ? 'gold' : 'default'}>{published ? 'Published' : 'Not published'}</Pill>
              </div>

              {!validation.isValid ? (
                <div role="alert" className="review-errors">
                  <b>
                    <AlertTriangle style={{ width: '16px', height: '16px' }} />
                    This chart can’t be laid out yet
                  </b>
                  {validation.errors.map((err, i) => (
                    <div key={i}>
                      <b>{err.message}</b>
                      <span>{err.details}</span>
                    </div>
                  ))}
                  <span className="review-fix">
                    {mode === 'manual'
                      ? 'Edit the nodes above to remove the loop or the missing prerequisite, then review again.'
                      : 'Switch to building it yourself to repair the nodes, or upload a cleaner syllabus.'}
                  </span>
                </div>
              ) : layout ? (
                <>
                  <p className="review-summary">
                    {draft.length} nodes • {draftXp.toLocaleString()} XP total • no cycles, no missing
                    prerequisites • laid out at {layout.width}×{layout.height}.
                  </p>
                  <LayoutPreview layout={layout} />
                </>
              ) : null}

              <div className="quest-name-actions">
                <button type="button" className="outline-action" onClick={startOver}>Start over</button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={handlePublish}
                  disabled={!validation.isValid || published}
                >
                  {published ? (
                    <>
                      <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                      Pathway published
                    </>
                  ) : (
                    <>
                      Publish the pathway
                      <ChevronRight style={{ width: '16px', height: '16px' }} />
                    </>
                  )}
                </button>
              </div>
              {published && (
                <p role="status" className="review-summary">
                  Published. Open the skill tree to see the chart.
                </p>
              )}
            </div>
          )}

          {mode !== 'choose' && draft.length === 0 && (
            <button type="button" className="outline-action" style={{ alignSelf: 'flex-start' }} onClick={startOver}>
              Choose a different way to start
            </button>
          )}

          <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HelpCircle style={{ width: '15px', height: '15px', color: 'var(--primary)' }} />
            <span>Need sample data? You can switch mock syllabus tracks anytime in the Skill Tree dashboard toolbar.</span>
          </div>
        </section>

        <aside className="info-cards-stack">
          <div className="import-card">
            <Pill tone="gold">ONE PIPELINE</Pill>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '4px 0 12px' }}>How it works</h3>
            <div className="how-steps-list">
              <div className="how-step-row">
                <span className="how-step-num">01</span>
                <div className="how-step-content">
                  <b>Choose how to start</b>
                  <p>Upload a syllabus, or add the nodes yourself.</p>
                </div>
              </div>

              <div className="how-step-row">
                <span className="how-step-num">02</span>
                <div className="how-step-content">
                  <b>Write the nodes</b>
                  <p>Title, description, kind, XP, and what comes first — the same fields either way.</p>
                </div>
              </div>

              <div className="how-step-row">
                <span className="how-step-num">03</span>
                <div className="how-step-content">
                  <b>Check and lay out</b>
                  <p>Cycles and missing prerequisites are caught here, whoever wrote the nodes.</p>
                </div>
              </div>

              <div className="how-step-row">
                <span className="how-step-num">04</span>
                <div className="how-step-content">
                  <b>Publish the pathway</b>
                  <p>Unlock student missions, earn XP, and track mastery.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="privacy-banner">
            <ShieldCheck />
            <div>
              <b style={{ display: 'block', marginBottom: '2px' }}>Student Privacy &amp; FERPA Bound</b>
              <span style={{ color: 'var(--muted-foreground)' }}>Your syllabus is processed securely to generate your personal learning pathway. Course records remain confidential.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Profile({
  profile,
  onSaveProfile,
  courseXp,
  masteredCount,
  streakDays
}: {
  profile: StudentProfile
  onSaveProfile: (p: StudentProfile) => void
  courseXp: CourseXpReadout
  masteredCount: number
  streakDays: number
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<StudentProfile>(profile)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(false)

  useEffect(() => {
    setFormData(profile)
  }, [profile])

  const initials = formData.fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'AR'

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!formData.fullName.trim()) errs.fullName = 'Full name is required.'
    if (!formData.universityEmail.trim()) {
      errs.universityEmail = 'University email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.universityEmail)) {
      errs.universityEmail = 'Invalid email format.'
    }
    if (!formData.studentNumber.trim()) errs.studentNumber = 'Student number is required.'
    if (!formData.program.trim()) errs.program = 'Program is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    setTimeout(() => {
      onSaveProfile(formData)
      setSaving(false)
      setIsEditing(false)
      setToast(true)
      setTimeout(() => setToast(false), 3500)
    }, 300)
  }

  const handleCancel = () => {
    setFormData(profile)
    setErrors({})
    setIsEditing(false)
  }

  return (
    <div className="profile-page-container">
      <PageHead
        eyebrow="YOUR IDENTITY"
        title="Student profile"
        copy="Manage your learning profile and academic information."
      />

      <div className="profile-grid">
        <article className="profile-summary-card">
          <div className="profile-avatar-row">
            <div className="profile-avatar-large">
              {initials}
              <button className="profile-avatar-edit" title="Change avatar" aria-label="Change avatar">
                <Camera style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
            <div className="profile-user-info">
              <h2>{profile.fullName}</h2>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>{profile.program}</p>
              <div style={{ marginTop: '6px' }}>
                <Pill tone="gold">{profile.studentNumber}</Pill>
              </div>
            </div>
          </div>

          {/* Same source as the chart meter and the dashboard header. */}
          <div className="profile-stats-grid">
            <div className="profile-stat-item">
              <b>{courseXp.level}</b>
              <span>Level</span>
            </div>
            <div className="profile-stat-item">
              <b>{courseXp.earned.toLocaleString()}</b>
              <span>XP on this chart</span>
            </div>
            <div className="profile-stat-item">
              <b>{masteredCount}</b>
              <span>Mastered</span>
            </div>
            <div className="profile-stat-item">
              <b>{streakDays}d</b>
              <span>Streak</span>
            </div>
          </div>

          <button
            className="outline-action"
            onClick={() => setIsEditing(!isEditing)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isEditing ? 'Cancel editing' : 'Edit profile'}
          </button>
        </article>

        <article className="academic-info-card">
          <h2>Academic information</h2>
          <form className="academic-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="fullName">
                Full name {errors.fullName && <span className="error-text">{errors.fullName}</span>}
              </label>
              <input
                id="fullName"
                type="text"
                disabled={!isEditing}
                className={errors.fullName ? 'error' : ''}
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="universityEmail">
                Mapúa email {errors.universityEmail && <span className="error-text">{errors.universityEmail}</span>}
              </label>
              <input
                id="universityEmail"
                type="email"
                disabled={!isEditing}
                className={errors.universityEmail ? 'error' : ''}
                value={formData.universityEmail}
                onChange={e => setFormData({ ...formData, universityEmail: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="studentNumber">
                Student number {errors.studentNumber && <span className="error-text">{errors.studentNumber}</span>}
              </label>
              <input
                id="studentNumber"
                type="text"
                disabled={!isEditing}
                className={errors.studentNumber ? 'error' : ''}
                value={formData.studentNumber}
                onChange={e => setFormData({ ...formData, studentNumber: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="program">Program</label>
              <select
                id="program"
                disabled={!isEditing}
                value={formData.program}
                onChange={e => setFormData({ ...formData, program: e.target.value })}
              >
                <option value="BS Computer Science">BS Computer Science</option>
                <option value="BS Information Technology">BS Information Technology</option>
                <option value="BS Computer Engineering">BS Computer Engineering</option>
                <option value="BS Data Science">BS Data Science</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="yearLevel">Year level</label>
              <select
                id="yearLevel"
                disabled={!isEditing}
                value={formData.yearLevel}
                onChange={e => setFormData({ ...formData, yearLevel: e.target.value })}
              >
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="campus">Campus</label>
              <select
                id="campus"
                disabled={!isEditing}
                value={formData.campus || 'Mapúa Intramuros'}
                onChange={e => setFormData({ ...formData, campus: e.target.value })}
              >
                <option value="Mapúa Intramuros">Mapúa Intramuros</option>
                <option value="Mapúa Makati">Mapúa Makati</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="studyPace">Preferred study pace</label>
              <select
                id="studyPace"
                disabled={!isEditing}
                value={formData.studyPace || 'Balanced (5 days/wk)'}
                onChange={e => setFormData({ ...formData, studyPace: e.target.value })}
              >
                <option value="Balanced (5 days/wk)">Balanced (5 days/wk)</option>
                <option value="Intense (Daily)">Intense (Daily)</option>
                <option value="Light (3 days/wk)">Light (3 days/wk)</option>
              </select>
            </div>

            {isEditing && (
              <div className="form-actions-row">
                <button type="button" className="outline-action" onClick={handleCancel}>
                  Cancel
                </button>
                <button type="submit" className="primary-action" disabled={saving}>
                  {saving ? 'Saving changes…' : 'Save changes'}
                </button>
              </div>
            )}
          </form>
        </article>
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#16a34a',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '12px',
          fontWeight: 700,
          fontSize: '13px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 200
        }}>
          <CheckCircle2 style={{ width: '18px', height: '18px' }} />
          Profile updated successfully.
        </div>
      )}
    </div>
  )
}

function SettingsPage() {
  const [notify, setNotify] = useState(true)
  return (
    <>
      <PageHead eyebrow="Preferences" title="Settings & privacy" copy="Choose how Cardinal Skill supports and communicates with you." />
      <div className="settings-list">
        <section>
          <h2>Notifications</h2>
          <Setting title="Mission reminders" copy="Get a nudge before a mission is due." on={notify} set={setNotify} />
          <Setting title="Weekly progress reflection" copy="Receive a concise recap every Friday." on={true} />
        </section>
        <section>
          <h2>Privacy</h2>
          <Setting title="Show progress to classmates" copy="Share only overall mastery, never grades." on={false} />
          <Setting title="Instructor learning signals" copy="Allow instructors to see where support may help." on={true} />
        </section>
        <section>
          <h2>Account</h2>
          <button className="setting-button"><LogOut />Sign out of this prototype</button>
          <button className="setting-button danger">Delete account data</button>
        </section>
      </div>
    </>
  )
}

function Setting({ title, copy, on, set }: { title: string; copy: string; on: boolean; set?: (v: boolean) => void }) {
  return (
    <div className="setting">
      <div><b>{title}</b><p>{copy}</p></div>
      {/* The label is the setting's own title: the switch is a bare <i/>, so
          without this a screen reader announces only "switch, on". */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        className={on ? 'on' : ''}
        onClick={() => set?.(!on)}
      >
        <i />
      </button>
    </div>
  )
}

function Instructor() {
  const avg = Math.round(prototypeData.analytics.reduce((a, b) => a + b.progress, 0) / prototypeData.analytics.length)
  return (
    <>
      <PageHead eyebrow="Faculty workspace" title="CS210 learning pulse" copy="Supportive signals for timely intervention — never a leaderboard." />
      <div className="stats">
        <Stat icon={Users} value="42 students" label="Active cohort" />
        <Stat icon={Target} value={`${avg}%`} label="Average mastery" />
        <Stat icon={Flame} value="8.6 days" label="Average streak" />
      </div>
      <div className="analytics-layout">
        <section className="analytics-card">
          <div className="section-title">
            <div>
              <p>Section A12</p>
              <h2>Student progress</h2>
            </div>
            <button className="outline-action">Export CSV</button>
          </div>
          {prototypeData.analytics.map(s => (
            <div className="student-row" key={s.id}>
              <div className="avatar">{s.name.split(' ').map(x => x[0]).join('')}</div>
              <p><b>{s.name}</b><span>{s.mastered} skills mastered • {s.streak} day streak</span></p>
              <div>
                <Progress value={s.progress} />
                <span>{s.progress}%</span>
              </div>
              <Pill tone={s.status === 'needs-support' ? 'gold' : 'muted'}>{s.status.replace('-', ' ')}</Pill>
            </div>
          ))}
        </section>
        <aside className="insight-card">
          <Sparkles />
          <Pill tone="gold">Teaching insight</Pill>
          <h2>Trees is the current friction point.</h2>
          <p>Seven learners revisited prerequisite material after attempting the Binary Search Tree mission.</p>
          <button>View skill insights<ChevronRight /></button>
        </aside>
      </div>
    </>
  )
}

function Onboarding({ setRoute }: { setRoute: (r: AppRoute) => void }) {
  const [step, setStep] = useState(0)
  const steps = [
    ['Welcome to your mastery map', 'Cardinal Skill turns every course into a visible path. You will always know what you mastered, what to practice, and what comes next.'],
    ['Choose your learning rhythm', 'Set a weekly target that feels ambitious and sustainable. You can change this any time.'],
    ['Your path is ready', 'We found three active courses and prepared your first missions.']
  ]
  return (
    <main className="center-page page-transition-enter">
      <div className="onboard-card">
        <div className="brand-mark">C</div>
        <span>Step {step + 1} of 3</span>
        <Progress value={(step + 1) * 33.3} />
        <h1>{steps[step][0]}</h1>
        <p>{steps[step][1]}</p>
        {step === 1 && (
          <div className="rhythm">
            {['3 days', '5 days', 'Daily'].map(x => (
              <button key={x}>{x}</button>
            ))}
          </div>
        )}
        <button className="primary-action" onClick={() => step < 2 ? setStep(step + 1) : setRoute('dashboard')}>
          {step === 2 ? 'Enter my skill tree' : 'Continue'}
          <ChevronRight />
        </button>
      </div>
    </main>
  )
}

function Welcome({ setRoute }: { setRoute: (r: AppRoute) => void }) {
  return (
    <main className="welcome page-transition-enter">
      <header>
        <div className="brand">
          <div className="brand-mark">C</div>
          <b>Cardinal Skill</b>
        </div>
        <button onClick={() => setRoute('auth')}>Sign in</button>
      </header>
      <section className="hero">
        <div>
          <Pill tone="gold">Built for Mapúans who keep moving forward</Pill>
          <h1>See what you know.<br /><em>Forge what comes next.</em></h1>
          <p>Cardinal Skill transforms your coursework into a living mastery map — so every study session has direction and every win has meaning.</p>
          <div>
            <button className="primary-action" onClick={() => setRoute('onboarding')}>Begin your journey<ChevronRight /></button>
            <button className="outline-action" onClick={() => setRoute('dashboard')}>Explore the demo</button>
          </div>
          <small>Student-first • Instructor-aware • Progress without pressure</small>
        </div>
        <div className="hero-map">
          <HeroSkillTree />
        </div>
      </section>
      <section className="promise">
        <p>Built around one powerful idea</p>
        <h2>Learning feels different when progress is visible.</h2>
        <div>
          {[['01', 'Find your path', 'Turn syllabi into connected skill journeys.'], ['02', 'Practice with purpose', 'Complete missions tied to meaningful outcomes.'], ['03', 'Own your growth', 'Reflect, build streaks, and celebrate mastery.']].map(x => (
            <article key={x[0]}>
              <b>{x[0]}</b>
              <h3>{x[1]}</h3>
              <p>{x[2]}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function Auth({ setRoute }: { setRoute: (r: AppRoute) => void }) {
  return (
    <main className="auth-page page-transition-enter">
      <section>
        <div className="brand"><div className="brand-mark">C</div><b>Cardinal Skill</b></div>
        <Pill tone="gold">Your next quest awaits</Pill>
        <h1>Return to your<br />learning realm.</h1>
        <p>Pick up where you left off and keep building your future, one skill at a time.</p>
      </section>
      <form onSubmit={e => { e.preventDefault(); setRoute('dashboard') }}>
        <h2>Welcome back</h2>
        <p>Use your Mapúa account to continue.</p>
        <label>University email<input type="email" required defaultValue="alex.rivera@mymail.mapua.edu.ph" /></label>
        <label>Password<input type="password" required defaultValue="cardinalskill" /></label>
        <div className="form-meta">
          <label><input type="checkbox" defaultChecked /> Remember me</label>
          <button type="button">Forgot password?</button>
        </div>
        <button className="primary-action" type="submit">Sign in<ChevronRight /></button>
        <span>Prototype credentials are prefilled.</span>
      </form>
    </main>
  )
}

export function CardinalApp() {
  const [route, setRoute] = useState<AppRoute>(APP_ROUTES.welcome)
  const [menu, setMenu] = useState(false)
  const [companionContext, setCompanionContext] = useState<AICompanionContext | null>(null)

  // The rail collapse choice is persisted; the default is collapsed so the
  // chart is the hero out of the box. Hydration reads the stored value once
  // — SSR paint always matches the pre-hydration DOM.
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(true)
  useEffect(() => { setSidebarCollapsedState(shellCollapseStorage.load().sidebarCollapsed) }, [])
  const setSidebarCollapsed = (v: boolean) => {
    setSidebarCollapsedState(v)
    const current = shellCollapseStorage.load()
    shellCollapseStorage.save({ ...current, sidebarCollapsed: v })
  }

  // Profile State Single Source of Truth
  const [profile, setProfile] = useState<StudentProfile>(() => {
    return profileStorageAdapter.loadProfile('usr_alex')
  })

  // Interactive local MVP state
  const [masteredIds, setMasteredIds] = useState<Set<string>>(
    new Set(['skill_1', 'skill_2', 'skill_3', 'skill_4', 'skill_5', 'skill_6', 'l1', 'l2', 'l3', 'r1', 'r2', 'w_1', 'w_2', 'w_3', 'w_4', 'w_5'])
  )
  const [streakDays, setStreakDays] = useState<number>(prototypeData.user.streakDays)
  const [missions, setMissions] = useState<DomainMission[]>(prototypeData.missions)

  /**
   * Mission XP after a "need extra help" request re-sliced it, by mission id.
   *
   * Kept beside the missions rather than written into them, so the fixture stays
   * the fixture and clearing this restores the original split exactly.
   */
  const [missionXp, setMissionXp] = useState<Record<string, number>>({})
  const effectiveMissions = useMemo(
    () => missions.map(m => (missionXp[m.id] === undefined ? m : { ...m, xpReward: missionXp[m.id] })),
    [missions, missionXp]
  )

  /** Where a deep link from the missions overview wants the chart to land. */
  const [focusSkillId, setFocusSkillId] = useState<string | null>(null)

  /**
   * The one XP number, computed from the chart. Seeded from the default course
   * so the sidebar and profile page have a real figure before the chart mounts,
   * then kept current by the chart itself — including its help subtrees and the
   * learner's personal XP-per-level.
   */
  const [courseXp, setCourseXp] = useState<CourseXpReadout>(() =>
    readCourseXp(mockCS210Payload.nodes, masteredIds, XP_PER_LEVEL)
  )

  // Generated quest names and the titles an instructor typed over them.
  const [naming, setNaming] = useState<QuestNameMap>({})
  useEffect(() => { setNaming(questNameStorageAdapter.loadNames('usr_alex')) }, [])

  const persistNaming = (next: QuestNameMap) => {
    setNaming(next)
    questNameStorageAdapter.saveNames('usr_alex', next)
  }

  const handleNamesGenerated = (names: QuestNaming[]) => {
    const next = { ...naming }
    for (const name of names) {
      // The overrides are carried over rather than replaced. The repository
      // already leaves an overridden node out of the batch; this is the same
      // re-check `name-quest` does at write time, for an override typed while
      // the request was in flight.
      next[name.nodeId] = {
        ...name,
        titleOverride: naming[name.nodeId]?.titleOverride ?? null,
        achievementTitleOverride: naming[name.nodeId]?.achievementTitleOverride ?? null
      }
    }
    persistNaming(next)
  }

  const handleSaveOverride = (
    nodeId: string,
    patch: Pick<QuestNaming, 'titleOverride' | 'achievementTitleOverride'>
  ) => {
    const existing = naming[nodeId]
    persistNaming({
      ...naming,
      [nodeId]: {
        nodeId,
        title: existing?.title ?? '',
        subtitle: existing?.subtitle ?? '',
        achievementTitle: existing?.achievementTitle ?? '',
        achievementDescription: existing?.achievementDescription ?? '',
        ...patch
      }
    })
  }

  const handleSaveProfile = (updatedProfile: StudentProfile) => {
    setProfile(updatedProfile)
    profileStorageAdapter.saveProfile(updatedProfile.id, updatedProfile)
  }

  const handleAskAICompanion = (context: AICompanionContext) => {
    setCompanionContext(context)
    setRoute('companion')
  }

  const handleToggleMastery = (skillId: string) => {
    if (!masteredIds.has(skillId)) {
      const eligibility = evaluateSkillUnlockState(skillId, mockCS210Payload.nodes, masteredIds)
      if (!eligibility.isUnlocked) {
        alert(`Cannot start or complete locked skill: ${eligibility.blockedReason}`)
        return
      }
    }

    // No separate XP counter to bump: the node's own reward is already in the
    // chart, and every readout derives from what is mastered.
    setMasteredIds(prev => {
      const next = new Set(prev)
      if (next.has(skillId)) {
        next.delete(skillId)
      } else {
        next.add(skillId)
      }
      return next
    })
  }

  /**
   * Mark one mission complete, or undo it, and let the node follow.
   *
   * Mastery is not set here so much as recomputed: a node is mastered when all
   * of its missions are done, so completing the last one masters it and undoing
   * any one of them takes it back. `masteredIds` stays the single set every
   * status derives from — there is no second idea of "finished".
   */
  const handleToggleMission = (missionId: string) => {
    const mission = missions.find(m => m.id === missionId)
    if (!mission) return

    const completing = mission.status !== 'completed'
    if (completing && !masteredIds.has(mission.skillId)) {
      // Backstop. The panel disables the control on a locked node, so this only
      // fires if something else reaches the handler.
      const eligibility = evaluateSkillUnlockState(mission.skillId, mockCS210Payload.nodes, masteredIds)
      if (!eligibility.isUnlocked) {
        alert(`Cannot complete a mission on a locked skill. ${eligibility.blockedReason ?? ''}`)
        return
      }
    }

    const next = missions.map(m =>
      m.id === missionId ? { ...m, status: (completing ? 'completed' : 'available') as DomainMission['status'] } : m
    )
    setMissions(next)

    const done = next.filter(m => m.status === 'completed').map(m => m.id)
    setMasteredIds(prev => {
      const ids = new Set(prev)
      if (isNodeMastered(next, mission.skillId, done)) ids.add(mission.skillId)
      else ids.delete(mission.skillId)
      return ids
    })
  }

  const handlePublishSyllabus = () => {
    // Mastery follows the missions, so the demo has to complete them rather
    // than declare the nodes done behind their own work.
    const published = new Set(['skill_7', 'skill_8', 'skill_9'])
    setMissions(prev => prev.map(m => (published.has(m.skillId) ? { ...m, status: 'completed' } : m)))
    setMasteredIds(prev => new Set([...prev, ...published]))
  }

  const handleOpenSkillFromMissions = (skillId: string) => {
    setFocusSkillId(skillId)
    setRoute('dashboard')
  }

  if (route === 'welcome') return <Welcome setRoute={setRoute} />
  if (route === 'auth') return <Auth setRoute={setRoute} />
  if (route === 'onboarding') return <Onboarding setRoute={setRoute} />

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'rail-collapsed' : ''} route-${route}`}>
      <Sidebar
        route={route}
        setRoute={setRoute}
        open={menu}
        setOpen={setMenu}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        courseXp={courseXp}
        profile={profile}
      />
      <main className="app-main">
        {route === 'dashboard' && (
          <Dashboard
            masteredIds={masteredIds}
            courseXp={courseXp}
            streakDays={streakDays}
            onToggleMastery={handleToggleMastery}
            missions={effectiveMissions}
            onToggleMission={handleToggleMission}
            onResliceMissions={rewards => setMissionXp(prev => ({ ...prev, ...rewards }))}
            onRestoreMissionXp={() => setMissionXp({})}
            focusSkillId={focusSkillId}
            onFocusHandled={() => setFocusSkillId(null)}
            onAskAICompanion={handleAskAICompanion}
            naming={naming}
            onNamesGenerated={handleNamesGenerated}
            onSaveOverride={handleSaveOverride}
            onCourseXp={setCourseXp}
          />
        )}
        {route === 'missions' && (
          <Missions missions={effectiveMissions} onOpenSkill={handleOpenSkillFromMissions} />
        )}
        {route === 'universal' && <Universal />}
        {route === 'companion' && (
          <Companion
            context={companionContext}
            onClearContext={() => setCompanionContext(null)}
          />
        )}
        {route === 'achievements' && <Achievements naming={naming} masteredIds={masteredIds} />}
        {route === 'syllabus' && <Syllabus onPublishSyllabus={handlePublishSyllabus} />}
        {route === 'profile' && (
          <Profile
            profile={profile}
            onSaveProfile={handleSaveProfile}
            courseXp={courseXp}
            masteredCount={masteredIds.size}
            streakDays={streakDays}
          />
        )}
        {route === 'settings' && <SettingsPage />}
        {route === 'instructor' && <Instructor />}
      </main>
    </div>
  )
}
