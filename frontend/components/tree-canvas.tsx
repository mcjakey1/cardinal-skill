'use client'

/**
 * The authoring canvas.
 *
 * Everything else in this workspace speaks the conventional LMS language an
 * instructor already knows. This one component does not, and that is deliberate:
 * an instructor is authoring the artifact a student receives, so the artifact is
 * drawn here exactly as it is delivered — the sixteen-colour field, square
 * corners, 2px bevels, DotGothic16, orthogonal edges with square junction dots.
 *
 * An authoring tool that renders its output in its own chrome instead of the
 * output's chrome cannot answer "what will they actually see", which is the one
 * question a course author has that nobody else does.
 *
 * Nothing about that grammar is re-declared here. Colours come from
 * `@theme/tokens`, the dither from `@theme/dither`, the edge geometry from
 * `@shared/edgeRouting`, and the unlock rules from `lib/progression`, which is
 * itself an adapter over the same shared module the phone runs.
 */

import { useMemo } from 'react'

import {
  DITHER_TILE,
  ditherFill,
  ditherId,
  fieldLevels,
  litCells,
} from '@theme/dither'
import { font, nodeStyle, palette } from '@theme/tokens'
import {
  arrowheadPoints,
  bendsOf,
  crossbarByPrereq,
  edgeWaypoints,
  orthogonalPath,
  type Routing,
} from '@shared/edgeRouting'

import type { SkillNode } from '@/lib/cardinal-domain'
import { deriveStatuses } from '@/lib/progression'

/** The student's cell, at the student's size. The mark is the touch target. */
const CELL = 44
const HALF = CELL / 2
const ARROW = 7

/** Ranks run top-to-bottom here; the phone ranks left-to-right. */
const CANVAS_ROUTING: Routing = {
  axis: 'vertical',
  in: HALF + 8,
  out: HALF + 8,
  elbowMin: 10,
  arrow: ARROW,
}

export type CanvasMode = 'student' | 'structure'

type Placed = SkillNode & { position: { x: number; y: number } }

/**
 * Structure mode paints the ramp an author actually controls.
 *
 * It keyed off `kind` first, which reads well until you notice the syllabus
 * fixtures never set it — every node fell through to `topic` and the mode drew
 * the same flat field as the student view. Difficulty is the field that is
 * populated, and it answers the question an author has when they look at a whole
 * tree at once: does this course ramp, or does it cliff?
 *
 * All four stay inside the sixteen. A seventeenth colour here would be a
 * seventeenth colour in the product.
 */
export const STRUCTURE_BANDS = [
  { key: 'Foundational', label: 'Foundational', fill: palette.brass, light: palette.gold, dark: palette.umber, ink: palette.abyss },
  { key: 'Intermediate', label: 'Intermediate', fill: palette.cardinal, light: palette.rose, dark: palette.blood, ink: palette.bone },
  { key: 'Advanced', label: 'Advanced', fill: palette.periwinkle, light: palette.blush, dark: palette.wine, ink: palette.abyss },
  { key: 'practice', label: 'Extra practice (ungraded)', fill: palette.wine, light: palette.blood, dark: palette.void, ink: palette.bone },
] as const

const bandFor = (node: { difficultyLabel?: string; graded?: boolean }) => {
  if (node.graded === false) return STRUCTURE_BANDS[3]
  return STRUCTURE_BANDS.find((b) => b.key === node.difficultyLabel) ?? STRUCTURE_BANDS[1]
}

interface Props {
  nodes: Placed[]
  width: number
  height: number
  mode: CanvasMode
  selectedId: string | null
  onSelect: (id: string) => void
  /** Node ids the validator flagged. Marked on the canvas, not just in a list. */
  invalidIds?: Set<string>
  /** Draw the ground flat instead of dithered. Mirrors the student's setting. */
  flat?: boolean
}

export function TreeCanvas({
  nodes,
  width,
  height,
  mode,
  selectedId,
  onSelect,
  invalidIds,
  flat = false,
}: Props) {
  // A tree with nothing mastered: what the class sees the day it is published.
  // The same shared rules the phone runs, so "available" here means available
  // there.
  const statuses = useMemo(() => deriveStatuses(nodes, []).status, [nodes])

  // The phone draws nine bands across roughly 800px, so a band is ~90px of
  // texture. Holding the count fixed on a canvas several times taller turns the
  // same field into wide hard stripes, so the count follows the height instead
  // and a band stays the size it is on the device this grammar was drawn for.
  const bands = Math.max(6, Math.min(28, Math.round(height / 90)))
  const levels = useMemo(() => fieldLevels(bands), [bands])

  const crossbars = useMemo(
    () =>
      crossbarByPrereq(
        nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
        nodes.flatMap((n) =>
          (n.prerequisiteIds || []).map((prereqId) => ({ from: prereqId, to: n.id })),
        ),
        CANVAS_ROUTING,
      ),
    [nodes],
  )

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Course chart, ${nodes.length} nodes, shown as a student receives it`}
      style={{ display: 'block', background: palette.wine }}
    >
      <defs>
        {!flat &&
          levels.map((level) => (
            <pattern
              key={`field-${level}`}
              id={ditherId('field', level)}
              patternUnits="userSpaceOnUse"
              width={DITHER_TILE}
              height={DITHER_TILE}
            >
              {litCells(level).map((c, i) => (
                <rect key={i} x={c.x} y={c.y} width={2} height={2} fill={palette.cardinal} />
              ))}
            </pattern>
          ))}
        <pattern
          id={ditherId('lock', 6)}
          patternUnits="userSpaceOnUse"
          width={DITHER_TILE}
          height={DITHER_TILE}
        >
          {litCells(6).map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width={2} height={2} fill={palette.wine} />
          ))}
        </pattern>
      </defs>

      {/* The ground: cardinal dithered into wine, densest at the top. */}
      <rect x={0} y={0} width={width} height={height} fill={flat ? palette.cardinal : palette.wine} />
      {!flat &&
        levels.map((level, i) => (
          <rect
            key={level + '-' + i}
            x={0}
            y={(i * height) / bands}
            width={width}
            height={height / bands + 1}
            fill={ditherFill('field', level)}
          />
        ))}

      {nodes.map((node) =>
        (node.prerequisiteIds || []).map((prereqId) => {
          const a = byId.get(prereqId)
          if (!a) return null
          const points = edgeWaypoints(a.position, node.position, CANVAS_ROUTING, crossbars.get(prereqId))
          // Nothing is mastered in a preview, so no edge is walked. `slate` is
          // what the student sees on an unwalked edge.
          const ink = node.parentNodeId ? palette.brass : palette.slate
          return (
            <g key={`${prereqId}->${node.id}`} opacity={0.85}>
              <path
                d={orthogonalPath(points)}
                fill="none"
                stroke={ink}
                strokeWidth={2}
                strokeLinejoin="miter"
              />
              <polygon points={arrowheadPoints(points, ARROW)} fill={ink} />
              {bendsOf(points, 2 * CANVAS_ROUTING.elbowMin).map((bend, i) => (
                <rect key={i} x={bend.x - 3} y={bend.y - 3} width={6} height={6} fill={ink} />
              ))}
            </g>
          )
        }),
      )}

      {nodes.map((node) => (
        <NodeCell
          key={node.id}
          node={node}
          status={statuses.get(node.id) ?? 'locked'}
          mode={mode}
          selected={node.id === selectedId}
          invalid={Boolean(invalidIds?.has(node.id))}
          flat={flat}
          onSelect={onSelect}
        />
      ))}
    </svg>
  )
}

function NodeCell({
  node,
  status,
  mode,
  selected,
  invalid,
  flat,
  onSelect,
}: {
  node: Placed
  status: string
  mode: CanvasMode
  selected: boolean
  invalid: boolean
  flat: boolean
  onSelect: (id: string) => void
}) {
  const s = nodeStyle[(status as keyof typeof nodeStyle) in nodeStyle ? (status as 'locked') : 'locked']
  const band = bandFor(node)
  const structural = mode === 'structure'

  const fill = structural ? band.fill : s.fill
  const light = structural ? band.light : s.light
  const dark = structural ? band.dark : s.dark
  const ink = structural ? band.ink : s.ink

  const x = node.position.x - HALF
  const y = node.position.y - HALF
  const locked = !structural && status === 'locked'

  const description = structural
    ? `${node.title}. ${band.label}. Worth ${node.xpReward ?? 0} XP.`
    : `${node.title}. ${s.label}. Worth ${node.xpReward ?? 0} XP.`

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={description}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(node.id)
        }
      }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <title>{description}</title>

      {locked ? (
        <>
          <rect x={x} y={y} width={CELL} height={CELL} fill={flat ? palette.oxblood : ditherFill('lock', 6)} />
          <rect x={x} y={y} width={CELL} height={CELL} fill="none" stroke={s.edge} strokeWidth={2} />
        </>
      ) : (
        <>
          <rect x={x} y={y} width={CELL} height={CELL} fill={fill} />
          {/* Bevel: lit along the top-left, dark along the bottom-right. */}
          <path
            d={`M${x},${y + CELL} L${x},${y} L${x + CELL},${y} L${x + CELL - 3},${y + 3} L${x + 3},${y + 3} L${x + 3},${y + CELL - 3} Z`}
            fill={light}
          />
          <path
            d={`M${x + CELL},${y} L${x + CELL},${y + CELL} L${x},${y + CELL} L${x + 3},${y + CELL - 3} L${x + CELL - 3},${y + CELL - 3} L${x + CELL - 3},${y + 3} Z`}
            fill={dark}
          />
        </>
      )}

      <Glyph
        kind={structural ? (node.graded === false ? 'check' : 'play') : (s.glyph as string)}
        x={node.position.x}
        y={node.position.y}
        colour={ink}
      />

      {/* A node the validator rejected wears blush — the one alarm colour the
          palette has, and the same one the student app spends on "next". */}
      {invalid && (
        <rect
          x={x - 5}
          y={y - 5}
          width={CELL + 10}
          height={CELL + 10}
          fill="none"
          stroke={palette.blush}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}

      {selected && (
        <rect
          x={x - 2}
          y={y - 2}
          width={CELL + 4}
          height={CELL + 4}
          fill="none"
          stroke={palette.bone}
          strokeWidth={2}
        />
      )}

      {wrapTitle(node.shortTitle || node.title).map((line, i) => (
        <text
          key={i}
          x={node.position.x}
          y={y + CELL + 18 + i * 16}
          /* Bone on every label, locked included: `haze` measures 2.11:1 on the
             cardinal field and the floor is 4.5:1. Status is already carried by
             the dithered cell and the lock glyph. */
          fill={palette.bone}
          fontSize={13}
          fontFamily={font.screen}
          textAnchor="middle"
        >
          {line}
        </text>
      ))}
    </g>
  )
}

/** Status glyphs on the same 8×8 grid as the student app's icon set. */
function Glyph({ kind, x, y, colour }: { kind: string; x: number; y: number; colour: string }) {
  const u = 2.4
  const at = (gx: number, gy: number, w = 1, h = 1) => (
    <rect
      key={`${gx}-${gy}-${w}-${h}`}
      x={x + (gx - 4) * u}
      y={y + (gy - 4) * u}
      width={w * u}
      height={h * u}
      fill={colour}
    />
  )

  if (kind === 'check') {
    return (
      <g>
        {at(1, 4)}{at(2, 5)}{at(3, 6)}{at(4, 5)}{at(5, 4)}{at(6, 3)}{at(7, 2)}
        {at(2, 4)}{at(3, 5)}{at(4, 4)}{at(5, 3)}{at(6, 2)}
      </g>
    )
  }
  if (kind === 'play') {
    return (
      <g>
        {at(3, 1, 1, 6)}{at(4, 2, 1, 4)}{at(5, 3, 1, 2)}
      </g>
    )
  }
  return (
    <g>
      {at(3, 1, 2, 1)}{at(2, 2, 1, 2)}{at(5, 2, 1, 2)}{at(1, 4, 6, 3)}
    </g>
  )
}

/** Two lines, because a chart of one-line labels is a chart of truncations. */
function wrapTitle(title: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of title.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > 14 && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.length > 2 ? [lines[0]!, `${lines[1]!.slice(0, 12)}…`] : lines
}
