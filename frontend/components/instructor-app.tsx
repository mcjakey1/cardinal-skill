'use client'

import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FileUp,
  GitBranch,
  Info,
  LayoutGrid,
  LifeBuoy,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { buildHelpSubtree } from '@shared/subtree'
import type { SkillNode as SharedSkillNode } from '@shared/types'

import { computeAutoLayout } from '@/lib/auto-layout'
import type { AnalyticsStudent, SkillNode } from '@/lib/cardinal-domain'
import {
  getSkillTree,
  nameQuests,
  prototypeAnalytics,
  requestHelpSubtree,
} from '@/lib/cardinal-repository'
import { APP_ROUTES, type AppRoute } from '@/lib/cardinal-routes'
import { MIN_COHORT, summariseCohort } from '@/lib/cohort'
import { validateSkillGraph, type GraphValidationError } from '@/lib/graph-validation'
import { graftHelpSubtree } from '@/lib/help-subtree'
import { levelForXp } from '@/lib/progression'
import { STRUCTURE_BANDS, TreeCanvas, type CanvasMode } from '@/components/tree-canvas'

/* ------------------------------------------------------------------ courses */

interface CourseRow {
  id: string
  code: string
  title: string
  term: string
  section: string
  students: number
}

/**
 * The courses this instructor owns.
 *
 * Six datasets ship with the repository, two of them deliberately malformed —
 * a dangling prerequisite and a cycle. They are listed here rather than hidden,
 * because a course whose tree will not validate is exactly the thing an
 * instructor needs to see on the courses screen.
 */
const COURSES: CourseRow[] = [
  { id: 'cs210', code: 'CS210', title: 'Data Structures & Algorithms', term: 'AY2026 T1', section: 'A12', students: 42 },
  { id: 'linear', code: 'CS101', title: 'Introduction to Computer Science', term: 'AY2026 T1', section: 'B03', students: 61 },
  { id: 'wide', code: 'CS300', title: 'Software Engineering', term: 'AY2026 T1', section: 'A04', students: 38 },
  { id: 'dual-roots', code: 'MATH201', title: 'Discrete Math & Logic', term: 'AY2026 T1', section: 'C21', students: 55 },
  { id: 'err-missing', code: 'ERR101', title: 'Corrupted Syllabus', term: 'Draft', section: '—', students: 0 },
  { id: 'err-cycle', code: 'ERR102', title: 'Cyclic Dependency Syllabus', term: 'Draft', section: '—', students: 0 },
]

const NAV: { route: AppRoute; label: string; icon: typeof LayoutGrid }[] = [
  { route: APP_ROUTES.courses, label: 'Courses', icon: BookOpen },
  { route: APP_ROUTES.tree, label: 'Skill tree', icon: GitBranch },
  { route: APP_ROUTES.students, label: 'Students', icon: Users },
  { route: APP_ROUTES.analytics, label: 'Class insights', icon: LayoutGrid },
  { route: APP_ROUTES.imports, label: 'Import syllabus', icon: FileUp },
]

/* -------------------------------------------------------------------- shell */

export function InstructorApp() {
  const [route, setRoute] = useState<AppRoute>(APP_ROUTES.courses)
  const [courseId, setCourseId] = useState<string>('cs210')
  const [railOpen, setRailOpen] = useState(false)

  const course = COURSES.find((c) => c.id === courseId) ?? COURSES[0]!

  const go = useCallback((next: AppRoute) => {
    setRoute(next)
    setRailOpen(false)
  }, [])

  return (
    <div className="shell">
      <aside className={`rail ${railOpen ? 'open' : ''}`} aria-label="Workspace navigation">
        <div className="rail-brand">
          <div className="brand-mark" aria-hidden="true">C</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>Cardinal Skill</b>
            <span>Instructor workspace</span>
          </div>
          <button
            className="btn btn-quiet btn-icon"
            onClick={() => setRailOpen(false)}
            aria-label="Close navigation"
            style={{ display: railOpen ? undefined : 'none' }}
          >
            <X />
          </button>
        </div>

        <div className="rail-course">
          <label className="t-micro" htmlFor="course-switch">Course</label>
          <select
            id="course-switch"
            className="select"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.section}
              </option>
            ))}
          </select>
        </div>

        <nav className="rail-nav" aria-label="Sections">
          {NAV.map((item) => (
            <button
              key={item.route}
              onClick={() => go(item.route)}
              aria-current={route === item.route ? 'page' : undefined}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <div className="rail-nav" style={{ padding: 0 }}>
            <button
              onClick={() => go(APP_ROUTES.settings)}
              aria-current={route === APP_ROUTES.settings ? 'page' : undefined}
            >
              <SettingsIcon aria-hidden="true" />
              <span>Settings</span>
            </button>
          </div>
          <div className="rail-user">
            <div className="avatar" aria-hidden="true">RS</div>
            <div style={{ minWidth: 0 }}>
              <b>Prof. R. Salvador</b>
              <span>Instructor</span>
            </div>
          </div>
        </div>
      </aside>

      {railOpen && (
        <button
          className="scrim"
          style={{ zIndex: 65 }}
          onClick={() => setRailOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-quiet btn-icon menu-button"
            onClick={() => setRailOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <button onClick={() => go(APP_ROUTES.courses)}>Courses</button>
            <ChevronRight aria-hidden="true" />
            <button onClick={() => go(APP_ROUTES.tree)}>{course.code}</button>
            <ChevronRight aria-hidden="true" />
            <b>{NAV.find((n) => n.route === route)?.label ?? 'Settings'}</b>
          </nav>
          <div className="topbar-end">
            <span className="badge">{course.term}</span>
          </div>
        </header>

        <div className={`main-scroll ${route === APP_ROUTES.tree ? 'flush' : ''}`}>
          {route === APP_ROUTES.courses && (
            <Courses
              activeId={courseId}
              onOpen={(id) => {
                setCourseId(id)
                go(APP_ROUTES.tree)
              }}
            />
          )}
          {route === APP_ROUTES.tree && <TreeAuthoring course={course} />}
          {route === APP_ROUTES.students && <Students course={course} />}
          {route === APP_ROUTES.analytics && <Analytics course={course} />}
          {route === APP_ROUTES.imports && <ImportSyllabus />}
          {route === APP_ROUTES.settings && <Settings />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ courses */

function Courses({ activeId, onOpen }: { activeId: string; onOpen: (id: string) => void }) {
  const [checks, setChecks] = useState<Record<string, GraphValidationError[]>>({})

  useEffect(() => {
    let live = true
    Promise.all(
      COURSES.map(async (c) => {
        const payload = await getSkillTree(c.id)
        return [c.id, validateSkillGraph(payload.nodes).errors] as const
      }),
    ).then((pairs) => {
      if (live) setChecks(Object.fromEntries(pairs))
    })
    return () => {
      live = false
    }
  }, [])

  const ready = Object.keys(checks).length > 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-page">Courses</h1>
          <p className="prose">
            Every course you teach this term. A tree has to validate before students can be
            enrolled onto it.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => onOpen('cs210')}>
            <FileUp aria-hidden="true" />
            Import a syllabus
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <caption className="t-micro" style={{ captionSide: 'top', padding: '9px 16px', textAlign: 'left' }}>
              {COURSES.length} courses
            </caption>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Term</th>
                <th scope="col">Section</th>
                <th scope="col" className="num">Students</th>
                <th scope="col">Tree</th>
              </tr>
            </thead>
            <tbody>
              {COURSES.map((c) => {
                const errors = checks[c.id]
                return (
                  <tr key={c.id} style={c.id === activeId ? { background: 'var(--brand-wash)' } : undefined}>
                    <td>
                      <button className="row-link" onClick={() => onOpen(c.id)}>
                        <span>
                          <span className="row-title">{c.code} — {c.title}</span>
                          <span className="row-sub">Open the skill tree</span>
                        </span>
                      </button>
                    </td>
                    <td>{c.term}</td>
                    <td>{c.section}</td>
                    <td className="num">{c.students || '—'}</td>
                    <td>
                      {!ready ? (
                        <div className="skeleton" style={{ width: 84 }} />
                      ) : errors && errors.length > 0 ? (
                        <span className="badge badge-attention">
                          <AlertTriangle aria-hidden="true" />
                          {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
                        </span>
                      ) : (
                        <span className="badge badge-ok">
                          <Check aria-hidden="true" />
                          Valid
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ tree authoring */

function TreeAuthoring({ course }: { course: CourseRow }) {
  const [nodes, setNodes] = useState<SkillNode[] | null>(null)
  const [mode, setMode] = useState<CanvasMode>('student')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'naming' | 'help'>(null)
  const [note, setNote] = useState<string | null>(null)
  const [renamed, setRenamed] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    setNodes(null)
    setSelectedId(null)
    setNote(null)
    setRenamed({})
    getSkillTree(course.id).then((payload) => {
      if (live) setNodes(payload.nodes)
    })
    return () => {
      live = false
    }
  }, [course.id])

  const validation = useMemo(
    () => (nodes ? validateSkillGraph(nodes) : { isValid: true, errors: [] }),
    [nodes],
  )

  const layout = useMemo(() => {
    if (!nodes || !validation.isValid) return null
    // Sized around the student's 44px cell plus its two label lines, not around
    // dagre's default 140×110 box — at the default the marks end up a screen
    // apart and the chart reads as empty field.
    return computeAutoLayout(nodes, {
      nodeWidth: 108,
      nodeHeight: 82,
      rankSep: 58,
      nodeSep: 26,
    })
  }, [nodes, validation.isValid])

  const invalidIds = useMemo(() => {
    const ids = new Set<string>()
    for (const error of validation.errors) {
      const match = error.details?.match(/\(([^)]+)\)/)
      if (match) ids.add(match[1]!)
    }
    return ids
  }, [validation.errors])

  const selected = nodes?.find((n) => n.id === selectedId) ?? null

  const runNaming = async () => {
    if (!nodes) return
    setBusy('naming')
    setNote(null)
    try {
      const { names, skipped } = await nameQuests(
        course.id,
        nodes.slice(0, 40),
        Object.keys(renamed),
      )
      setRenamed((prev) => ({
        ...prev,
        ...Object.fromEntries(names.map((n) => [n.nodeId, n.title])),
      }))
      setNote(
        `Named ${names.length} ${names.length === 1 ? 'quest' : 'quests'}` +
          (skipped > 0 ? `. ${skipped} kept the name you gave them.` : '.'),
      )
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Naming failed.')
    } finally {
      setBusy(null)
    }
  }

  const addHelp = async () => {
    if (!nodes || !selected) return
    setBusy('help')
    setNote(null)
    try {
      const steps = await requestHelpSubtree(selected.id, selected.shortTitle || selected.title)
      const parent: SharedSkillNode = {
        id: selected.id,
        courseId: course.id,
        trackId: null,
        title: selected.title,
        description: selected.description ?? '',
        kind: 'topic',
        xpReward: selected.xpReward ?? 0,
        x: 0,
        y: 0,
        sortOrder: 0,
        parentNodeId: null,
        graded: true,
      }
      let n = 0
      const subtree = buildHelpSubtree(parent, steps, () => `help_${selected.id}_${(n += 1)}`)
      const graft = graftHelpSubtree(selected, subtree)

      setNodes((prev) =>
        prev
          ? [
              ...prev.map((node) =>
                node.id === graft.parentPatch.id
                  ? {
                      ...node,
                      xpReward: graft.parentPatch.xpReward,
                      prerequisiteIds: graft.parentPatch.prerequisiteIds,
                    }
                  : node,
              ),
              ...graft.nodes,
            ]
          : prev,
      )
      setNote(
        `Added ${graft.nodes.length} practice steps. The XP was carved out of ` +
          `${selected.shortTitle || selected.title}, not minted — the course is still worth the same.`,
      )
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not build extra practice.')
    } finally {
      setBusy(null)
    }
  }

  if (!nodes) {
    return (
      <div className="canvas-column" style={{ flex: 1 }}>
        <div className="canvas-toolbar">
          <div className="skeleton" style={{ width: 180, height: 20 }} />
        </div>
        <div className="state state-centred" style={{ marginTop: 80 }}>
          <p>Reading {course.code}…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="canvas-layout">
      <div className="canvas-column">
        <div className="canvas-toolbar">
          <div className="segmented" role="group" aria-label="Canvas view">
            <button aria-pressed={mode === 'student'} onClick={() => setMode('student')}>
              As students see it
            </button>
            <button aria-pressed={mode === 'structure'} onClick={() => setMode('structure')}>
              Structure
            </button>
          </div>

          <div className="spacer" />

          <button className="btn btn-sm" onClick={runNaming} disabled={busy !== null || !validation.isValid}>
            <Sparkles aria-hidden="true" />
            {busy === 'naming' ? 'Naming…' : 'Name quests'}
          </button>
          <button
            className="btn btn-sm"
            onClick={addHelp}
            disabled={busy !== null || !selected || !validation.isValid}
            title={selected ? undefined : 'Select a node first'}
          >
            <LifeBuoy aria-hidden="true" />
            {busy === 'help' ? 'Building…' : 'Add extra practice'}
          </button>
          <button className="btn btn-sm btn-primary" disabled={!validation.isValid}>
            <Check aria-hidden="true" />
            Publish
          </button>
        </div>

        {mode === 'structure' && validation.isValid && (
          <ul className="legend" aria-label="What the colours mean">
            {STRUCTURE_BANDS.map((b) => (
              <li key={b.key}>
                <span className="legend-chip" style={{ background: b.fill }} aria-hidden="true" />
                {b.label}
              </li>
            ))}
          </ul>
        )}

        {note && (
          <div style={{ padding: '12px 16px 0' }}>
            <div className="notice">
              <Info aria-hidden="true" />
              <div>{note}</div>
            </div>
          </div>
        )}

        {!validation.isValid ? (
          <div style={{ padding: 20 }}>
            <div className="notice notice-error" style={{ marginBottom: 16 }}>
              <AlertTriangle aria-hidden="true" />
              <div>
                <b>This tree cannot be published yet.</b>
                No chart is drawn while the graph is invalid — a cycle has no order to draw and a
                dangling prerequisite has nowhere to point.
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h2 className="t-section">
                  {validation.errors.length} {validation.errors.length === 1 ? 'problem' : 'problems'} to fix
                </h2>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Problem</th>
                      <th scope="col">Where</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.errors.map((error, i) => (
                      <tr key={i}>
                        <td className="row-title">{error.message}</td>
                        <td className="muted">{error.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="canvas-stage">
            {layout && (
              <TreeCanvas
                nodes={layout.nodes}
                width={layout.width}
                height={layout.height}
                mode={mode}
                selectedId={selectedId}
                onSelect={setSelectedId}
                invalidIds={invalidIds}
              />
            )}
          </div>
        )}
      </div>

      <aside className="canvas-inspector" aria-label="Node details">
        {selected ? (
          <>
            <div className="inspector-section">
              <h2 className="t-section" style={{ marginBottom: 4 }}>
                {renamed[selected.id] ?? selected.title}
              </h2>
              {renamed[selected.id] && (
                <p className="t-small muted">Syllabus name: {selected.title}</p>
              )}
              <div className="row row-wrap" style={{ marginTop: 10 }}>
                <span className="badge badge-brand">{selected.kind || 'topic'}</span>
                {selected.graded === false && <span className="badge badge-gold">Ungraded practice</span>}
                {selected.difficultyLabel && <span className="badge">{selected.difficultyLabel}</span>}
              </div>
            </div>

            <div className="inspector-section">
              <dl className="inspector-grid">
                <dt>XP</dt>
                <dd className="t-num">{selected.xpReward ?? 0}</dd>
                <dt>Prerequisites</dt>
                <dd className="t-num">{selected.prerequisiteIds.length}</dd>
                {selected.estimatedMinutes ? (
                  <>
                    <dt>Estimated</dt>
                    <dd className="t-num">{selected.estimatedMinutes} min</dd>
                  </>
                ) : null}
                {selected.moduleName ? (
                  <>
                    <dt>Module</dt>
                    <dd>{selected.moduleName}</dd>
                  </>
                ) : null}
              </dl>
            </div>

            {selected.learningObjective && (
              <div className="inspector-section">
                <h3 className="t-micro" style={{ marginBottom: 6 }}>Learning objective</h3>
                <p className="t-small">{selected.learningObjective}</p>
              </div>
            )}

            {selected.prerequisiteIds.length > 0 && (
              <div className="inspector-section">
                <h3 className="t-micro">Opens after</h3>
                <div className="prereq-list">
                  {selected.prerequisiteIds.map((id) => {
                    const prereq = nodes.find((n) => n.id === id)
                    return (
                      <button key={id} onClick={() => prereq && setSelectedId(id)}>
                        <ArrowLeft aria-hidden="true" width={14} height={14} />
                        {prereq ? prereq.shortTitle || prereq.title : `Unknown node ${id}`}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="state">
            <GitBranch aria-hidden="true" />
            {validation.isValid ? (
              <>
                <h2 className="t-section">No node selected</h2>
                <p className="t-small">
                  Select a cell on the chart to see what it is worth, what it opens after, and to
                  graft extra practice onto it.
                </p>
              </>
            ) : (
              <>
                <h2 className="t-section">No chart to inspect</h2>
                <p className="t-small">
                  Fix the {validation.errors.length === 1 ? 'problem' : 'problems'} listed beside
                  this panel and the chart is drawn. Nothing can be selected until the graph is
                  valid.
                </p>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

/* ----------------------------------------------------------------- students */

function Students({ course }: { course: CourseRow }) {
  const [filter, setFilter] = useState<'all' | 'needs-support'>('all')

  const shown = useMemo(
    () =>
      filter === 'all'
        ? prototypeAnalytics
        : prototypeAnalytics.filter((s) => s.status === 'needs-support'),
    [filter],
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-page">Students</h1>
          <p className="prose">
            {course.code} section {course.section}. Progress is how far through the tree a student
            has got. Grades are not shown here and are not stored by Cardinal Skill.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn">
            <Download aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Filter students">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All ({prototypeAnalytics.length})
        </button>
        <button aria-pressed={filter === 'needs-support'} onClick={() => setFilter('needs-support')}>
          Needs support ({prototypeAnalytics.filter((s) => s.status === 'needs-support').length})
        </button>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col" className="num">Skills cleared</th>
                <th scope="col">Progress</th>
                <th scope="col" className="num">Streak</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <StudentRow key={s.id} student={s} />
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <div className="state state-centred">
            <Users aria-hidden="true" />
            <p>No students match this filter.</p>
          </div>
        )}
      </div>
    </>
  )
}

function StudentRow({ student }: { student: AnalyticsStudent }) {
  const initials = student.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)

  return (
    <tr>
      <td>
        <div className="row">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div>
            <div className="row-title">{student.name}</div>
          </div>
        </div>
      </td>
      <td className="num">{student.mastered}</td>
      <td>
        <div className="meter">
          <div className="meter-track">
            <div
              className={`meter-fill ${student.progress < 30 ? 'is-low' : ''}`}
              style={{ width: `${student.progress}%` }}
            />
          </div>
          <span>{student.progress}%</span>
        </div>
      </td>
      <td className="num">{student.streak}d</td>
      <td>
        {student.status === 'needs-support' ? (
          <span className="badge badge-attention">Needs support</span>
        ) : (
          <span className="badge badge-ok">On track</span>
        )}
      </td>
    </tr>
  )
}

/* ---------------------------------------------------------------- analytics */

function Analytics({ course }: { course: CourseRow }) {
  const [scope, setScope] = useState<'all' | 'needs-support'>('all')
  const [nodes, setNodes] = useState<SkillNode[] | null>(null)

  useEffect(() => {
    let live = true
    setNodes(null)
    getSkillTree(course.id).then((payload) => {
      if (live) setNodes(payload.nodes)
    })
    return () => {
      live = false
    }
  }, [course.id])

  const group = useMemo(
    () =>
      scope === 'all'
        ? prototypeAnalytics
        : prototypeAnalytics.filter((s) => s.status === 'needs-support'),
    [scope],
  )

  const result = summariseCohort(group)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-page">Class insights</h1>
          <p className="prose">
            Aggregates for {course.code} section {course.section}. Figures are suppressed whenever
            fewer than {MIN_COHORT} students match, so no individual can be identified from a
            filtered average.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn" disabled={result.suppressed}>
            <Download aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Cohort scope">
        <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
          Whole section
        </button>
        <button aria-pressed={scope === 'needs-support'} onClick={() => setScope('needs-support')}>
          Needs support
        </button>
      </div>

      <div className="stack-section">
        {result.suppressed ? (
          <div className="notice notice-attention">
            <AlertTriangle aria-hidden="true" />
            <div>
              <b>Figures hidden for this group</b>
              {result.reason} Widen the filter to see aggregates.
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <h2 className="t-section">Cohort</h2>
              <div className="panel-head-actions">
                <span className="badge">{result.summary.size} students</span>
              </div>
            </div>
            <div className="panel-body">
              <dl className="inspector-grid" style={{ gridTemplateColumns: 'auto 1fr', maxWidth: 420 }}>
                <dt>Average progress</dt>
                <dd className="t-num">{result.summary.averageProgress}%</dd>
                <dt>Average skills cleared</dt>
                <dd className="t-num">{result.summary.averageMastered}</dd>
                <dt>Average streak</dt>
                <dd className="t-num">{result.summary.averageStreak} days</dd>
                <dt>Flagged for support</dt>
                <dd className="t-num">{result.summary.needsSupport}</dd>
              </dl>
            </div>
          </div>
        )}
      </div>

      <div className="stack-section">
        <h2 className="t-section">Where the class is</h2>
        <div className="panel">
          {!nodes ? (
            <div className="panel-body stack-tight">
              <div className="skeleton" style={{ width: '60%' }} />
              <div className="skeleton" style={{ width: '45%' }} />
              <div className="skeleton" style={{ width: '52%' }} />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Skill</th>
                    <th scope="col">Module</th>
                    <th scope="col" className="num">XP</th>
                    <th scope="col" className="num">Prerequisites</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.slice(0, 8).map((n) => (
                    <tr key={n.id}>
                      <td className="row-title">{n.title}</td>
                      <td className="muted">{n.moduleName ?? '—'}</td>
                      <td className="num">{n.xpReward ?? 0}</td>
                      <td className="num">{n.prerequisiteIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {nodes && <ChartWorth nodes={nodes} />}
    </>
  )
}

/**
 * What the whole chart is worth, and the level that buys.
 *
 * Summed here rather than through the shared `totalXp`, which takes the shared
 * node shape this app does not hold. Casting into it would compile today and
 * break silently the moment that function starts reading a second field.
 *
 * Grafting help does not move this number: `fragmentXp` carves a parent's XP up
 * between the parent and its new steps rather than minting more, so the total is
 * invariant across "add extra practice" — which is the property that keeps two
 * students who did the same work worth the same amount.
 */
function ChartWorth({ nodes }: { nodes: SkillNode[] }) {
  const worth = nodes.reduce((sum, n) => sum + (n.xpReward ?? 0), 0)
  return (
    <p className="t-small muted" style={{ marginTop: 12 }}>
      Clearing every node on this chart is worth{' '}
      <span className="t-num">{worth.toLocaleString()}</span> XP, which reaches level{' '}
      <span className="t-num">{levelForXp(worth)}</span>. Grafting extra practice redistributes
      this total rather than adding to it.
    </p>
  )
}

/* ------------------------------------------------------------------- import */

function ImportSyllabus() {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')

  const ready = title.trim().length > 0 && text.trim().length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setState('working')
    // The parser is a Supabase Edge Function that has never been deployed from
    // this repository. Reporting that plainly beats a progress bar that lies.
    window.setTimeout(() => setState('error'), 700)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-page">Import a syllabus</h1>
          <p className="prose">
            Paste the syllabus text and the parser reads it into a tree of what depends on what.
            You review and edit the result before any student sees it.
          </p>
        </div>
      </div>

      <div className="split">
        <form className="panel" onSubmit={submit}>
          <div className="panel-body stack">
            <label className="field">
              <span>Course name</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Data Structures & Algorithms"
              />
            </label>

            <label className="field">
              <span>Syllabus text</span>
              <textarea
                className="textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Week 1 — Computational thinking…"
              />
              <span className="field-hint">
                PDF and DOCX extraction runs server-side and is not wired in this build. Paste the
                text for now.
              </span>
            </label>

            {state === 'error' && (
              <div className="notice notice-error">
                <AlertTriangle aria-hidden="true" />
                <div>
                  <b>The parser is not reachable</b>
                  The <code>parse-syllabus</code> function has not been deployed from this
                  repository. Nothing was saved.
                </div>
              </div>
            )}

            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={!ready || state === 'working'}>
                {state === 'working' ? 'Reading…' : 'Draw the tree'}
              </button>
              <span className="t-small muted">You review the tree before publishing.</span>
            </div>
          </div>
        </form>

        <div className="panel">
          <div className="panel-head">
            <h2 className="t-section">What the parser returns</h2>
          </div>
          <div className="panel-body">
            <p className="t-small">
              A node per topic, reading, assignment and assessment, plus the prerequisite edges
              between them. Anything it returns is validated before it is drawn: cycles, dangling
              references and duplicate ids are rejected rather than rendered.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- settings */

function Settings() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-page">Settings</h1>
          <p className="prose">Workspace preferences and what this build can actually do.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="t-section">This build</h2>
        </div>
        <div className="panel-body stack">
          <p className="t-small prose">
            Authentication is not wired. Course data comes from six fixture datasets in the
            repository, two of them deliberately malformed so the validator can be exercised. The
            syllabus parser and the quest namer are Supabase Edge Functions that have not been
            deployed from this repository — the naming action here runs the same deterministic
            fallback the fixtures use.
          </p>
          <p className="t-small prose">
            Students use a separate application. Nothing on this screen changes what a student
            sees until a tree is published.
          </p>
        </div>
      </div>
    </>
  )
}
