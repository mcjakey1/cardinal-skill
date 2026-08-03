"use client"

import { useMemo, useState, useEffect, useRef } from 'react'
import {
  AlertTriangle, Award, Bell, BookOpen, Bot, Brain, Check, CheckCircle2, ChevronRight, CircleUserRound, Code2,
  Database, FileUp, Flame, GraduationCap, LayoutDashboard, Lock, LogOut, Map, Menu,
  MessageCircle, Network, Maximize2, PanelLeftClose, PanelRightOpen, RefreshCw, RotateCcw, Search, Settings,
  ShieldCheck, Sparkles, Target, Terminal, Trophy, Users, X, Zap, ZoomIn, ZoomOut
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prototypeData, getSkillTree } from '@/lib/cardinal-repository'
import type { SkillNode as DomainSkillNode, SkillTreePayload, Mission as DomainMission, SkillStatus } from '@/lib/cardinal-domain'
import { APP_ROUTES, type AppRoute } from '@/lib/cardinal-routes'
import { deriveStatuses, levelForXp, levelProgress, xpForLevel } from '@/lib/progression'
import { validateSkillGraph } from '@/lib/graph-validation'
import { computeAutoLayout } from '@/lib/auto-layout'
import { localStorageTreeLayoutAdapter, type UserTreeLayout } from '@/lib/tree-layout-persistence'

const nav: { route: AppRoute; label: string; icon: LucideIcon }[] = [
  { route: 'dashboard', label: 'Skill tree', icon: Map },
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

function getEdgePath(
  source: { x: number; y: number },
  target: { x: number; y: number },
  multiOffset: number = 0
) {
  const x1 = source.x
  const y1 = source.y + 38 // parent bottom diamond handle
  const x2 = target.x
  const y2 = target.y - 38 // child top diamond handle

  const dx = x2 - x1
  const dy = y2 - y1

  if (dy > 30) {
    const verticalGap = dy * 0.5
    const cp1X = x1 + multiOffset
    const cp1Y = y1 + verticalGap
    const cp2X = x2 - multiOffset
    const cp2Y = y2 - verticalGap
    return `M ${x1} ${y1} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x2} ${y2}`
  } else {
    const curveDip = Math.max(55, Math.abs(dx) * 0.22)
    const cp1X = x1 + dx * 0.35 + multiOffset
    const cp1Y = y1 + curveDip
    const cp2X = x2 - dx * 0.35 - multiOffset
    const cp2Y = y2 - curveDip
    return `M ${x1} ${y1} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x2} ${y2}`
  }
}

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

function Sidebar({ route, setRoute, open, setOpen, userXp }: { route: AppRoute; setRoute: (r: AppRoute) => void; open: boolean; setOpen: (v: boolean) => void; userXp: number }) {
  const level = levelForXp(userXp)
  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu />
      </button>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
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
            <button key={item.route} className={route === item.route ? 'active' : ''} onClick={() => { setRoute(item.route); setOpen(false) }}>
              <item.icon />
              <span>{item.label}</span>
              {route === item.route && <ChevronRight />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button onClick={() => setRoute('profile')}>
            <CircleUserRound />
            <span>Profile</span>
          </button>
          <button onClick={() => setRoute('settings')}>
            <Settings />
            <span>Settings</span>
          </button>
          <div className="student-chip">
            <div>AR</div>
            <p>
              <b>Alex Rivera</b>
              <span>Level {level} • {userXp.toLocaleString()} XP</span>
            </p>
          </div>
        </div>
      </aside>
      {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    </>
  )
}

function SkillTree({
  payload,
  masteredIds,
  onToggleMastery,
  selectedDataset,
  onSelectDataset
}: {
  payload: SkillTreePayload
  masteredIds: Set<string>
  onToggleMastery: (skillId: string) => void
  selectedDataset: string
  onSelectDataset: (key: string) => void
}) {
  const userId = 'usr_alex'
  const { course, nodes: rawNodes } = payload

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
  const [resetModalOpen, setResetModalOpen] = useState(false)

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

  // Combine automatic layout positions with user custom position overrides
  const skills = useMemo(() => {
    return autoLayoutResult.nodes.map(node => {
      const customPos = customPositions[node.id]
      return {
        ...node,
        position: customPos ? customPos : node.position
      }
    })
  }, [autoLayoutResult.nodes, customPositions])

  const canvasWidth = autoLayoutResult.width
  const canvasHeight = autoLayoutResult.height

  const [selectedId, setSelectedId] = useState<string>('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(.65) // Compact default zoom 65%
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panelOpen, setPanelOpen] = useState(true)

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

  // Ensure default selected skill exists in dataset
  useEffect(() => {
    if (skills.length > 0 && (!selectedId || !skills.some(s => s.id === selectedId))) {
      setSelectedId(skills[0].id)
    }
  }, [skills, selectedId])

  // Pure graph status derivation
  const treeInput = useMemo(() => ({
    nodes: skills.map(s => ({ id: s.id, title: s.title, xpReward: s.xpReward || 100 })),
    prereqs: skills.flatMap(s => (s.prerequisiteIds || []).map(p => ({ nodeId: s.id, prereqId: p })))
  }), [skills])

  const { status: calculatedStatusMap } = useMemo(() => deriveStatuses(treeInput, masteredIds), [treeInput, masteredIds])

  const selected = skills.find(s => s.id === selectedId) || skills[0]
  const currentStatus: SkillStatus = selected && masteredIds.has(selected.id)
    ? 'mastered'
    : (selected ? (calculatedStatusMap.get(selected.id) as SkillStatus) || 'locked' : 'locked')

  const statusCopy: Record<SkillStatus, string> = {
    mastered: 'Mastered',
    in_progress: 'In progress',
    available: 'Available',
    locked: 'Locked'
  }

  // Selected prerequisite chain highlighting
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

  // Hovered parent/child edges highlighting
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

  // Debounced persistence helper
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

  // Non-passive wheel handler to isolate canvas zoom from main browser page scrolling
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

  const fit = () => { setZoom(.62); setPan({ x: 0, y: 0 }) }
  const reset = () => { setZoom(1.0); setPan({ x: 0, y: 0 }) }
  const focusSelected = () => {
    if (!selected) return
    setZoom(1.0)
    setPan({ x: Math.round((canvasWidth / 2) - selected.position.x), y: Math.round((canvasHeight / 2) - selected.position.y) })
    setPanelOpen(true)
  }

  const handleAutoArrange = () => {
    setCustomPositions({})
    localStorageTreeLayoutAdapter.clearLayout(userId, course.id)
    setSavedNotice(false)
    setZoom(.62)
    setPan({ x: 0, y: 0 })
  }

  const handleConfirmReset = () => {
    handleAutoArrange()
    setResetModalOpen(false)
  }

  const masteredCount = skills.filter(s => masteredIds.has(s.id)).length
  const hasCustomLayout = Object.keys(customPositions).length > 0

  return (
    <div className={`tree-explorer ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      <section className="tree-card">
        <div className="tree-toolbar">
          <div className="tree-title">
            <Pill>{course.code}</Pill>
            <span>{skills.length} skills • {masteredCount} mastered</span>
            <b>{course.title}</b>
          </div>
          <div className="tree-actions">
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Dataset:
              <select
                value={selectedDataset}
                onChange={e => onSelectDataset(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '11px', fontWeight: 700 }}
              >
                <option value="cs210">1. CS210 Branching (16 skills)</option>
                <option value="linear">2. CS101 Linear (6 skills)</option>
                <option value="wide">3. CS300 Wide Realm (25 skills)</option>
                <option value="dual-roots">4. MATH201 Dual Roots (4 skills)</option>
                <option value="err-missing">5. Invalid: Missing Prereq</option>
                <option value="err-cycle">6. Invalid: Cycle Loop</option>
              </select>
            </label>
            <span className="toolbar-separator" />

            <button
              onClick={handleAutoArrange}
              title="Auto-arrange nodes to default layout"
              aria-label="Auto arrange layout"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 10px', fontSize: '11px', fontWeight: 700 }}
            >
              <RotateCcw style={{ width: '14px', height: '14px' }} />
              Auto-arrange
            </button>

            {hasCustomLayout && (
              <button
                onClick={() => setResetModalOpen(true)}
                title="Reset layout to AI default"
                aria-label="Reset layout"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 10px', fontSize: '11px', fontWeight: 700, color: '#981e2f' }}
              >
                Reset layout
              </button>
            )}

            {savedNotice && hasCustomLayout && (
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px', padding: '0 4px' }}>
                <Check style={{ width: '13px', height: '13px' }} /> Layout saved
              </span>
            )}

            <span className="toolbar-separator" />
            <button onClick={fit} title="Fit skill tree" aria-label="Fit skill tree"><Maximize2 /></button>
            <button onClick={reset} title="Reset view" aria-label="Reset view"><RefreshCw /></button>
            <button onClick={focusSelected} title="Focus selected skill" aria-label="Focus selected skill"><Search /></button>
            <span className="toolbar-separator" />
            <button onClick={() => setZoom(z => Math.max(.35, z - .1))} aria-label="Zoom out"><ZoomOut /></button>
            <b>{Math.round(zoom * 100)}%</b>
            <button onClick={() => setZoom(z => Math.min(1.5, z + .1))} aria-label="Zoom in"><ZoomIn /></button>
          </div>
        </div>

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
          <div className="canvas-hint">Drag canvas to pan • Drag nodes to customize arrangement • Scroll to zoom</div>

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
                      className={`skill-node ${nodeStatus} ${selected?.id === skill.id ? 'selected' : ''}`}
                      onClick={() => { setSelectedId(skill.id); setPanelOpen(true) }}
                      onMouseEnter={() => setHoveredId(skill.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      aria-label={`${skill.title}, ${statusCopy[nodeStatus]}`}
                      aria-pressed={selected?.id === skill.id}
                    >
                      <Icon />
                      {nodeStatus === 'locked' && <Lock className="lock" />}
                      {nodeStatus === 'mastered' && <CheckCircle2 className="lock" style={{ color: '#eab308' }} />}
                    </button>
                    <span>{skill.shortTitle || skill.title}</span>
                    <small>{statusCopy[nodeStatus]}</small>
                  </div>
                )
              })}

              <svg className="links" aria-hidden="true" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                {skills.flatMap(targetNode => {
                  const targetPos = targetNode.position
                  const prereqs = targetNode.prerequisiteIds || []
                  const prereqCount = prereqs.length

                  return prereqs.map((prereqId, pIdx) => {
                    const sourceNode = skills.find(s => s.id === prereqId)
                    if (!sourceNode) return null
                    const sourcePos = sourceNode.position

                    const multiOffset = prereqCount > 1
                      ? (pIdx === 0 ? -16 : pIdx === 1 ? 16 : 0)
                      : 0

                    const pathData = getEdgePath(sourcePos, targetPos, multiOffset)

                    const sourceMastered = masteredIds.has(sourceNode.id)
                    const targetMastered = masteredIds.has(targetNode.id)
                    const isMasteredLink = sourceMastered && targetMastered
                    const isAvailableLink = sourceMastered && !targetMastered

                    const edgeKey = `${sourceNode.id}->${targetNode.id}`
                    const isSelectedEdge = selectedPathEdges.has(edgeKey)
                    const isHoveredEdge = hoveredPathEdges.has(edgeKey)
                    const isHighlighted = isSelectedEdge || isHoveredEdge

                    const strokeOpacity = (selectedId || hoveredId)
                      ? (isHighlighted ? 1.0 : 0.22)
                      : 0.9

                    const linkClass = isMasteredLink
                      ? 'link-mastered'
                      : isAvailableLink
                        ? 'link-available'
                        : 'link-locked'

                    return (
                      <path
                        key={edgeKey}
                        d={pathData}
                        className={`${linkClass} ${isHighlighted ? 'highlighted' : ''}`}
                        style={{ opacity: strokeOpacity }}
                      />
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
        </div>
        <div className="legend">
          <span><i className="mastered" />Mastered</span>
          <span><i className="active" />In progress</span>
          <span><i className="available" />Available</span>
          <span><i className="locked" />Locked</span>
          <button onClick={() => setPanelOpen(!panelOpen)}>
            {panelOpen ? <PanelLeftClose /> : <PanelRightOpen />}
            {panelOpen ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </section>

      <aside className="detail-card" aria-hidden={!panelOpen}>
        {selected ? (
          <>
            <button className="panel-close" onClick={() => setPanelOpen(false)} aria-label="Collapse skill details">
              <PanelLeftClose />
            </button>
            <div className={`detail-icon ${currentStatus}`}>
              {(() => { const I = iconMap[selected.icon || 'code'] || Code2; return <I /> })()}
            </div>
            <Pill tone={currentStatus === 'mastered' ? 'gold' : 'default'}>{statusCopy[currentStatus]}</Pill>
            <h2>{selected.title}</h2>
            <p>{selected.description || 'Master this outcome to unlock advanced challenges in your syllabus path.'}</p>
            <div className="detail-progress">
              <span><b>{currentStatus === 'mastered' ? 100 : currentStatus === 'available' ? 45 : 0}%</b> complete</span>
              <Progress value={currentStatus === 'mastered' ? 100 : currentStatus === 'available' ? 45 : 0} />
            </div>
            <dl>
              <div>
                <dt>Reward</dt>
                <dd><Zap /> {selected.xpReward || 150} XP</dd>
              </div>
              <div>
                <dt>Challenges</dt>
                <dd>{(selected.missionIds || []).length || 1} mission</dd>
              </div>
            </dl>
            <button
              className="primary-action"
              disabled={currentStatus === 'locked'}
              onClick={() => onToggleMastery(selected.id)}
            >
              {currentStatus === 'mastered'
                ? 'Review skill'
                : currentStatus === 'in_progress'
                  ? 'Complete skill mission'
                  : currentStatus === 'available'
                    ? 'Start quest & master'
                    : 'Complete prerequisites'}
              <ChevronRight />
            </button>
          </>
        ) : (
          <div style={{ color: 'var(--muted-foreground)' }}>Select a node to inspect details</div>
        )}
      </aside>

      {/* Reset Layout Confirmation Modal */}
      {resetModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 10px' }}>Reset your skill-tree arrangement?</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 24px', lineHeight: 1.5 }}>
              This returns nodes to the recommended AI-generated layout. Your learning progress will not be affected.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setResetModalOpen(false)}
                style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', fontWeight: 700 }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                style={{ padding: '9px 16px', borderRadius: '10px', border: 0, background: '#981e2f', color: '#fff', fontWeight: 800 }}
              >
                Reset layout
              </button>
            </div>
          </div>
        </div>
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
  userXp,
  streakDays,
  onToggleMastery
}: {
  masteredIds: Set<string>
  userXp: number
  streakDays: number
  onToggleMastery: (skillId: string) => void
}) {
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string>('cs210')
  const [payload, setPayload] = useState<SkillTreePayload | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

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

  const currentXp = 2840
  const currentLevel = 6
  const nextLevelXp = 4000
  const remainingXp = nextLevelXp - currentXp
  const progressPct = 71

  const skillsCount = payload?.nodes.length || 0
  const masteredCount = payload?.nodes.filter(s => masteredIds.has(s.id)).length || 0
  const courseMasteryPct = skillsCount > 0 ? Math.round((masteredCount / skillsCount) * 100) : 0

  return (
    <div className="dashboard-page">
      <PageHead
        eyebrow="Your learning realm"
        title="Forge your path, Alex"
        copy="Every skill is a step forward. Drag nodes to customize your personal layout or reset to AI default anytime."
      />
      <div className="stats">
        <Stat icon={Flame} value={`${streakDays} days`} label="Current streak" />
        <article className="stat-card">
          <div><Zap /></div>
          <div className="xp-card-row">
            <div className="xp-info">
              <b>{currentXp.toLocaleString()} XP</b>
              <span>Level {currentLevel} progress</span>
            </div>
            <div className="xp-bar-container">
              <div className="xp-bar-labels">
                <span>{remainingXp.toLocaleString()} XP to Level 7</span>
                <span>{progressPct}%</span>
              </div>
              <div className="xp-bar-track">
                <div className="xp-bar-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>
        </article>
        <Stat icon={Trophy} value={`${masteredCount} skills`} label="Mastered this term" />
      </div>
      <div className="section-title">
        <div>
          <p>{payload?.course.code || 'CS210'} • {payload?.course.title || 'Skill Map'}</p>
          <h2>Academic skill tree</h2>
        </div>
        <Pill tone="gold">{courseMasteryPct}% course mastery</Pill>
      </div>

      {loading || !payload ? (
        <div className="tree-card" style={{ height: '650px', display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <RefreshCw className="animate-spin" style={{ width: '32px', height: '32px', color: 'var(--primary)' }} />
            <b>Loading syllabus skill tree…</b>
          </div>
        </div>
      ) : (
        <SkillTree
          payload={payload}
          masteredIds={masteredIds}
          onToggleMastery={onToggleMastery}
          selectedDataset={selectedDatasetKey}
          onSelectDataset={setSelectedDatasetKey}
        />
      )}
    </div>
  )
}

function Missions({
  missions,
  onCompleteMission
}: {
  missions: DomainMission[]
  onCompleteMission: (id: string, xp: number) => void
}) {
  const [filter, setFilter] = useState('all')
  const list = missions.filter(m => filter === 'all' || m.status === filter)

  return (
    <>
      <PageHead eyebrow="Quest log" title="Missions" copy="Turn course concepts into proof of mastery through focused challenges." />
      <div className="filter-row">
        {['all', 'in-progress', 'available', 'completed'].map(f => (
          <button className={filter === f ? 'active' : ''} onClick={() => setFilter(f)} key={f}>
            {f.replace('-', ' ')}
          </button>
        ))}
      </div>
      <div className="card-grid">
        {list.map(m => (
          <article className="mission-card" key={m.id}>
            <div>
              <Pill tone={m.status === 'completed' ? 'gold' : 'default'}>{m.status.replace('-', ' ')}</Pill>
              <Pill tone="muted">{m.type}</Pill>
            </div>
            <h2>{m.title}</h2>
            <p>{m.description}</p>
            <footer>
              <span>{m.durationMinutes} min • {m.xpReward} XP</span>
              <button
                onClick={() => {
                  if (m.status !== 'completed' && m.status !== 'locked') {
                    onCompleteMission(m.id, m.xpReward)
                  }
                }}
              >
                {m.status === 'completed' ? 'Review' : m.status === 'locked' ? 'Locked' : 'Complete mission'}
                <ChevronRight />
              </button>
            </footer>
          </article>
        ))}
      </div>
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

function Companion() {
  const [messages, setMessages] = useState<string[]>([
    'Hi Alex — I can help you unpack a concept, plan a study session, or reflect on a mission.'
  ])
  const [input, setInput] = useState('')

  const send = () => {
    if (!input.trim()) return
    const userQuery = input
    setMessages(prev => [...prev, userQuery, 'A useful place to start is to map the concept to what you already mastered. Want a guided example or a short practice question?'])
    setInput('')
  }

  return (
    <>
      <PageHead eyebrow="Study support" title="Cardinal companion" copy="A reflective learning partner grounded in your current skill path." />
      <div className="chat-card">
        <div className="chat-top">
          <div><Bot /></div>
          <p><b>Cardinal</b><span>Learning companion • Online</span></p>
        </div>
        <div className="messages">
          {messages.map((m, i) => (
            <div className={i % 2 ? 'user' : 'bot'} key={i}>{m}</div>
          ))}
        </div>
        <div className="suggestions">
          {['Explain recursion simply', 'Plan my week', 'Quiz me on trees'].map(x => (
            <button key={x} onClick={() => setInput(x)}>{x}</button>
          ))}
        </div>
        <div className="composer">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }}
            placeholder="Ask about your learning path…"
          />
          <button onClick={send}>Send</button>
        </div>
        <small>Connected to study guidance system. Secure student-first mode active.</small>
      </div>
    </>
  )
}

function Achievements() {
  return (
    <>
      <PageHead eyebrow="Milestones" title="Achievements" copy="A record of your momentum, consistency, and academic growth." />
      <div className="achievement-hero">
        <Trophy />
        <div>
          <Pill tone="gold">2 of 4 unlocked</Pill>
          <h2>Your effort is becoming expertise.</h2>
          <p>Keep your streak alive and master the Trees branch to reveal your next rare badge.</p>
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

function Syllabus({ onPublishSyllabus }: { onPublishSyllabus: () => void }) {
  const [file, setFile] = useState(false)
  const [published, setPublished] = useState(false)

  return (
    <>
      <PageHead eyebrow="Course setup" title="Import your syllabus" copy="Transform a course outline into a navigable skill path. You stay in control before anything is published." />
      <div className="upload-layout">
        <label className="upload-zone">
          <input type="file" accept=".pdf,.doc,.docx" onChange={() => setFile(true)} />
          <FileUp />
          <h2>{file ? 'CS210-syllabus.pdf ready' : 'Drop your syllabus here'}</h2>
          <p>PDF or DOCX, up to 10 MB</p>
          <span>{file ? 'Replace file' : 'Choose a file'}</span>
        </label>
        <aside className="how-card">
          <Pill>How it works</Pill>
          {['Upload your official course syllabus', 'Review detected outcomes and modules', 'Adjust the suggested skill tree', 'Publish when everything looks right'].map((x, i) => (
            <div key={x}>
              <b>0{i + 1}</b>
              <p>{x}</p>
            </div>
          ))}
          {file && (
            <button
              className="primary-action"
              style={{ marginTop: '1rem' }}
              onClick={() => {
                setPublished(true)
                onPublishSyllabus()
              }}
            >
              {published ? 'Syllabus Published!' : 'Publish Skill Tree'}
              <ChevronRight />
            </button>
          )}
        </aside>
      </div>
    </>
  )
}

function Profile({ userXp, streakDays }: { userXp: number; streakDays: number }) {
  const level = levelForXp(userXp)
  return (
    <>
      <PageHead eyebrow="Your identity" title="Student profile" copy="Control how your learning story appears across Cardinal Skill." />
      <div className="profile-grid">
        <article className="profile-card">
          <div className="big-avatar">AR</div>
          <h2>{prototypeData.user.name}</h2>
          <p>{prototypeData.user.program}</p>
          <Pill>{prototypeData.user.studentNumber}</Pill>
          <dl>
            <div><dt>Level</dt><dd>{level}</dd></div>
            <div><dt>Mastered</dt><dd>13</dd></div>
            <div><dt>Streak</dt><dd>{streakDays} days</dd></div>
          </dl>
          <button>Edit profile</button>
        </article>
        <article className="form-card">
          <h2>Academic information</h2>
          <label>Full name<input defaultValue="Alex Rivera" /></label>
          <label>Mapúa email<input defaultValue={prototypeData.user.email} /></label>
          <label>Program<input defaultValue="BS Computer Science" /></label>
          <label>Year level
            <select defaultValue="2">
              <option>1</option>
              <option>2</option>
              <option>3</option>
              <option>4</option>
            </select>
          </label>
          <button className="primary-action">Save changes</button>
        </article>
      </div>
    </>
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
      <button role="switch" aria-checked={on} className={on ? 'on' : ''} onClick={() => set?.(!on)}><i /></button>
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
    <main className="center-page">
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
    <main className="welcome">
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
          <div className="crest"><GraduationCap /></div>
          {['Foundations', 'Data structures', 'Algorithms', 'Mastery'].map((x, i) => (
            <div className={`hero-node n${i}`} key={x}>
              <i>{i + 1}</i>
              <span>{x}</span>
            </div>
          ))}
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
    <main className="auth-page">
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

  // Interactive local MVP state
  const [masteredIds, setMasteredIds] = useState<Set<string>>(
    new Set(['skill_1', 'skill_2', 'skill_3', 'skill_4', 'skill_5', 'skill_6', 'l1', 'l2', 'l3', 'r1', 'r2', 'w_1', 'w_2', 'w_3', 'w_4', 'w_5'])
  )
  const [userXp, setUserXp] = useState<number>(prototypeData.user.xp)
  const [streakDays, setStreakDays] = useState<number>(prototypeData.user.streakDays)
  const [missions, setMissions] = useState<DomainMission[]>(prototypeData.missions)

  const handleToggleMastery = (skillId: string) => {
    setMasteredIds(prev => {
      const next = new Set(prev)
      if (next.has(skillId)) {
        next.delete(skillId)
      } else {
        next.add(skillId)
        setUserXp(curr => curr + 150)
      }
      return next
    })
  }

  const handleCompleteMission = (missionId: string, xpReward: number) => {
    setMissions(prev => prev.map(m => m.id === missionId ? { ...m, status: 'completed' } : m))
    setUserXp(curr => curr + xpReward)

    const mission = missions.find(m => m.id === missionId)
    if (mission?.skillId) {
      setMasteredIds(prev => new Set([...prev, mission.skillId]))
    }
  }

  const handlePublishSyllabus = () => {
    setMasteredIds(prev => new Set([...prev, 'skill_7', 'skill_8', 'skill_9']))
    setUserXp(curr => curr + 450)
  }

  if (route === 'welcome') return <Welcome setRoute={setRoute} />
  if (route === 'auth') return <Auth setRoute={setRoute} />
  if (route === 'onboarding') return <Onboarding setRoute={setRoute} />

  return (
    <div className="app-shell">
      <Sidebar route={route} setRoute={setRoute} open={menu} setOpen={setMenu} userXp={userXp} />
      <main className="app-main">
        {route === 'dashboard' && (
          <Dashboard
            masteredIds={masteredIds}
            userXp={userXp}
            streakDays={streakDays}
            onToggleMastery={handleToggleMastery}
          />
        )}
        {route === 'missions' && (
          <Missions missions={missions} onCompleteMission={handleCompleteMission} />
        )}
        {route === 'universal' && <Universal />}
        {route === 'companion' && <Companion />}
        {route === 'achievements' && <Achievements />}
        {route === 'syllabus' && <Syllabus onPublishSyllabus={handlePublishSyllabus} />}
        {route === 'profile' && <Profile userXp={userXp} streakDays={streakDays} />}
        {route === 'settings' && <SettingsPage />}
        {route === 'instructor' && <Instructor />}
      </main>
    </div>
  )
}
