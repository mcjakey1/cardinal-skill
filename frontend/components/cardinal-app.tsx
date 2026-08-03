"use client"

import { useMemo, useState, useEffect } from 'react'
import {
  Award, Bell, BookOpen, Bot, Brain, CheckCircle2, ChevronRight, CircleUserRound, Code2,
  Database, FileUp, Flame, GraduationCap, LayoutDashboard, Lock, LogOut, Map, Menu,
  MessageCircle, Network, Maximize2, PanelLeftClose, PanelRightOpen, Search, Settings,
  ShieldCheck, Sparkles, Target, Terminal, Trophy, Users, X, Zap, ZoomIn, ZoomOut
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prototypeData } from '@/lib/cardinal-repository'
import type { SkillNode as DomainSkillNode, Mission as DomainMission, SkillStatus } from '@/lib/cardinal-domain'
import { APP_ROUTES, type AppRoute } from '@/lib/cardinal-routes'
import { deriveStatuses, levelForXp, levelProgress, xpForLevel } from '@/lib/progression'

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

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
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
  skills,
  masteredIds,
  onToggleMastery
}: {
  skills: DomainSkillNode[]
  masteredIds: Set<string>
  onToggleMastery: (skillId: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string>(skills[6]?.id || skills[0]?.id)
  const [zoom, setZoom] = useState(.9)
  const [pan, setPan] = useState({ x: 0, y: -45 })
  const [panelOpen, setPanelOpen] = useState(true)
  const [drag, setDrag] = useState<{ x: number; y: number; px: number; py: number } | null>(null)

  // Derive pure statuses from graph
  const treeInput = useMemo(() => ({
    nodes: skills.map(s => ({ id: s.id, title: s.title, xpReward: s.xpReward })),
    prereqs: skills.flatMap(s => s.prerequisites.map(p => ({ nodeId: s.id, prereqId: p })))
  }), [skills])

  const { status: calculatedStatusMap } = useMemo(() => deriveStatuses(treeInput, masteredIds), [treeInput, masteredIds])

  const selected = skills.find(s => s.id === selectedId) || skills[0]
  const currentStatus: SkillStatus = masteredIds.has(selected.id)
    ? 'mastered'
    : (calculatedStatusMap.get(selected.id) as SkillStatus) || 'locked'

  const statusCopy: Record<SkillStatus, string> = {
    mastered: 'Mastered',
    active: 'In progress',
    available: 'Available',
    locked: 'Locked'
  }

  const fit = () => { setZoom(.9); setPan({ x: 0, y: -45 }) }
  const focusSelected = () => { setZoom(1.08); setPan({ x: 0, y: -80 }); setPanelOpen(true) }

  const masteredCount = masteredIds.size

  return (
    <div className={`tree-explorer ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      <section className="tree-card">
        <div className="tree-toolbar">
          <div className="tree-title">
            <Pill>CS210</Pill>
            <span>{skills.length} skills • {masteredCount} mastered</span>
            <b>Academic skill tree</b>
          </div>
          <div className="tree-actions">
            <button onClick={fit} aria-label="Fit skill tree"><Maximize2 /></button>
            <button onClick={focusSelected} aria-label="Focus selected skill"><Search /></button>
            <span className="toolbar-separator" />
            <button onClick={() => setZoom(Math.max(.6, zoom - .1))} aria-label="Zoom out"><ZoomOut /></button>
            <b>{Math.round(zoom * 100)}%</b>
            <button onClick={() => setZoom(Math.min(1.5, zoom + .1))} aria-label="Zoom in"><ZoomIn /></button>
          </div>
        </div>

        <div
          className={`tree-viewport ${drag ? 'dragging' : ''}`}
          onWheel={e => { e.preventDefault(); setZoom(z => Math.min(1.5, Math.max(.6, z - e.deltaY * .001))) }}
          onPointerDown={e => {
            if ((e.target as HTMLElement).closest('button')) return
            setDrag({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y })
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={e => { if (drag) setPan({ x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y }) }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <div className="canvas-hint">Drag to explore • Scroll to zoom</div>
          <div className="tree-canvas" style={{ transform: `translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})` }}>
            {skills.map((skill, index) => {
              const nodeStatus: SkillStatus = masteredIds.has(skill.id)
                ? 'mastered'
                : (calculatedStatusMap.get(skill.id) as SkillStatus) || 'locked'

              const Icon = iconMap[skill.icon] || Code2
              return (
                <div key={skill.id} className={`skill-wrap s${index + 1}`}>
                  <button
                    className={`skill-node ${nodeStatus} ${selected.id === skill.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedId(skill.id); setPanelOpen(true) }}
                    aria-label={`${skill.title}, ${statusCopy[nodeStatus]}`}
                    aria-pressed={selected.id === skill.id}
                  >
                    <Icon />
                    {nodeStatus === 'locked' && <Lock className="lock" />}
                    {nodeStatus === 'mastered' && <CheckCircle2 className="lock" style={{ color: '#eab308' }} />}
                  </button>
                  <span>{skill.shortTitle}</span>
                  <small>{statusCopy[nodeStatus]}</small>
                </div>
              )
            })}
            <svg className="links" aria-hidden="true" viewBox="0 0 100 800" preserveAspectRatio="none">
              {[[50, 115, 25, 170], [50, 115, 75, 170], [25, 220, 15, 290], [25, 220, 40, 290], [75, 220, 65, 290], [75, 220, 88, 290], [15, 340, 22, 415], [40, 340, 48, 415], [65, 340, 48, 415], [88, 340, 76, 415], [22, 465, 12, 540], [48, 465, 36, 540], [48, 465, 62, 540], [76, 465, 87, 540], [36, 590, 35, 665], [62, 590, 68, 665]].map((p, i) => (
                <line className={i < masteredCount ? 'link-active' : ''} key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} />
              ))}
            </svg>
          </div>
          <div className="tree-minimap" aria-hidden="true">
            <div className="mini-path" />
            {skills.slice(0, 8).map((_, i) => (
              <i key={i} style={{ left: `${18 + (i % 4) * 21}%`, top: `${16 + Math.floor(i / 4) * 45}%` }} />
            ))}
            <span />
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
        <button className="panel-close" onClick={() => setPanelOpen(false)} aria-label="Collapse skill details">
          <PanelLeftClose />
        </button>
        <div className={`detail-icon ${currentStatus}`}>
          {(() => { const I = iconMap[selected.icon] || Code2; return <I /> })()}
        </div>
        <Pill tone={currentStatus === 'mastered' ? 'gold' : 'default'}>{statusCopy[currentStatus]}</Pill>
        <h2>{selected.title}</h2>
        <p>{selected.description}</p>
        <div className="detail-progress">
          <span><b>{currentStatus === 'mastered' ? 100 : currentStatus === 'available' ? 45 : 0}%</b> complete</span>
          <Progress value={currentStatus === 'mastered' ? 100 : currentStatus === 'available' ? 45 : 0} />
        </div>
        <dl>
          <div>
            <dt>Reward</dt>
            <dd><Zap /> {selected.xpReward} XP</dd>
          </div>
          <div>
            <dt>Challenges</dt>
            <dd>{selected.missionIds.length} mission</dd>
          </div>
        </dl>
        <button
          className="primary-action"
          disabled={currentStatus === 'locked'}
          onClick={() => onToggleMastery(selected.id)}
        >
          {currentStatus === 'mastered'
            ? 'Review skill'
            : currentStatus === 'active'
              ? 'Complete skill mission'
              : currentStatus === 'available'
                ? 'Start quest & master'
                : 'Complete prerequisites'}
          <ChevronRight />
        </button>
      </aside>
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
  skills,
  masteredIds,
  userXp,
  streakDays,
  onToggleMastery
}: {
  skills: DomainSkillNode[]
  masteredIds: Set<string>
  userXp: number
  streakDays: number
  onToggleMastery: (skillId: string) => void
}) {
  const level = levelForXp(userXp)
  const pctToNextLevel = Math.round(levelProgress(userXp) * 100)
  const courseMasteryPct = Math.round((masteredIds.size / skills.length) * 100)

  return (
    <div className="dashboard-page">
      <PageHead
        eyebrow="Your learning realm"
        title="Forge your path, Alex"
        copy="Every skill is a step forward. Continue Data Structures & Algorithms or explore what unlocks next."
      />
      <div className="stats">
        <Stat icon={Flame} value={`${streakDays} days`} label="Current streak" />
        <Stat icon={Zap} value={`${userXp.toLocaleString()} XP`} label={`Level ${level} progress`} progress={pctToNextLevel} />
        <Stat icon={Trophy} value={`${masteredIds.size} skills`} label="Mastered this term" />
      </div>
      <div className="section-title">
        <div>
          <p>CS210 • Data Structures & Algorithms</p>
          <h2>Academic skill tree</h2>
        </div>
        <Pill tone="gold">{courseMasteryPct}% course mastery</Pill>
      </div>
      <SkillTree skills={skills} masteredIds={masteredIds} onToggleMastery={onToggleMastery} />
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
  const [skills, setSkills] = useState<DomainSkillNode[]>(prototypeData.skills)
  const [masteredIds, setMasteredIds] = useState<Set<string>>(
    new Set(['skill_1', 'skill_2', 'skill_3', 'skill_4', 'skill_5', 'skill_6'])
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
        // Award XP on new mastery
        const skill = skills.find(s => s.id === skillId)
        if (skill) {
          setUserXp(curr => curr + skill.xpReward)
        }
      }
      return next
    })
  }

  const handleCompleteMission = (missionId: string, xpReward: number) => {
    setMissions(prev => prev.map(m => m.id === missionId ? { ...m, status: 'completed' } : m))
    setUserXp(curr => curr + xpReward)

    // Mark corresponding skill mastered if applicable
    const mission = missions.find(m => m.id === missionId)
    if (mission?.skillId) {
      setMasteredIds(prev => new Set([...prev, mission.skillId]))
    }
  }

  const handlePublishSyllabus = () => {
    // Dynamically unlock more skills upon syllabus import
    setMasteredIds(prev => new Set([...prev, 'skill_7', 'skill_8']))
    setUserXp(curr => curr + 350)
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
            skills={skills}
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
