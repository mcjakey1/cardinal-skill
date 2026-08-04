"use client"

import { useState } from 'react'
import { BookOpen, Code2, Brain, Database, Network, GraduationCap, Sparkles } from 'lucide-react'

interface HeroNode {
  id: string
  title: string
  label: string
  icon: typeof BookOpen
  x: number
  y: number
  tier: number
  type: 'root' | 'active' | 'unlocked' | 'mastery'
}

const HERO_NODES: HeroNode[] = [
  { id: 'root', title: 'Foundational Knowledge', label: 'Foundations', icon: BookOpen, x: 210, y: 370, tier: 1, type: 'root' },
  { id: 'prog', title: 'Programming Logic', label: 'Programming', icon: Code2, x: 110, y: 260, tier: 2, type: 'active' },
  { id: 'crit', title: 'Analytical Thinking', label: 'Critical Thinking', icon: Brain, x: 310, y: 260, tier: 2, type: 'active' },
  { id: 'ds', title: 'Linear Data Structures', label: 'Data Structures', icon: Database, x: 110, y: 150, tier: 3, type: 'unlocked' },
  { id: 'algo', title: 'Algorithm Analysis', label: 'Algorithms', icon: Network, x: 310, y: 150, tier: 3, type: 'unlocked' },
  { id: 'mastery', title: 'Academic Capstone', label: 'Mastery', icon: GraduationCap, x: 210, y: 45, tier: 4, type: 'mastery' }
]

const CONNECTIONS = [
  { from: 'root', to: 'prog', active: true },
  { from: 'root', to: 'crit', active: true },
  { from: 'prog', to: 'ds', active: true },
  { from: 'crit', to: 'algo', active: false },
  { from: 'ds', to: 'mastery', active: false },
  { from: 'algo', to: 'mastery', active: false }
]

function getCurvePath(x1: number, y1: number, x2: number, y2: number) {
  const dy = y2 - y1
  const cp1Y = y1 + dy * 0.5
  const cp2Y = y2 - dy * 0.5
  return `M ${x1} ${y1} C ${x1} ${cp1Y}, ${x2} ${cp2Y}, ${x2} ${y2}`
}

export function HeroSkillTree() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  return (
    <div className="hero-skill-tree-container">
      {/* Background Orbit & Low-Opacity Particle Grid */}
      <div className="hero-tree-bg" aria-hidden="true">
        <div className="orbit-ring ring-outer" />
        <div className="orbit-ring ring-inner" />
        <div className="radial-glow glow-root" />
        <div className="radial-glow glow-mastery" />
        
        {/* Subtle floating particles */}
        <span className="hero-particle p1" />
        <span className="hero-particle p2" />
        <span className="hero-particle p3" />
        <span className="hero-particle p4" />
      </div>

      <svg className="hero-tree-svg" viewBox="0 0 420 440" aria-hidden="true">
        <defs>
          <linearGradient id="activeGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#981e2f" />
            <stop offset="100%" stopColor="#d2a33a" />
          </linearGradient>
          <linearGradient id="mutedGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ded4c4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#d2a33a" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Dynamic Branch Lines */}
        {CONNECTIONS.map((conn, idx) => {
          const source = HERO_NODES.find(n => n.id === conn.from)
          const target = HERO_NODES.find(n => n.id === conn.to)
          if (!source || !target) return null

          const pathD = getCurvePath(source.x, source.y, target.x, target.y)
          const isHighlighted = hoveredNode === source.id || hoveredNode === target.id

          return (
            <path
              key={`${conn.from}-${conn.to}`}
              d={pathD}
              className={`hero-branch-path ${conn.active ? 'active-path' : 'muted-path'} ${isHighlighted ? 'highlighted-path' : ''}`}
              style={{ animationDelay: `${idx * 0.2}s` }}
            />
          )
        })}
      </svg>

      {/* Interactive Skill Nodes */}
      <div className="hero-nodes-layer">
        {HERO_NODES.map((node, index) => {
          const Icon = node.icon
          const isHovered = hoveredNode === node.id

          return (
            <div
              key={node.id}
              className={`hero-node-item node-${node.type} tier-${node.tier} ${isHovered ? 'hovered' : ''}`}
              style={{
                left: `${(node.x / 420) * 100}%`,
                top: `${(node.y / 440) * 100}%`,
                animationDelay: `${0.3 + index * 0.15}s`
              }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <div className="hero-node-badge">
                <Icon />
                {node.type === 'mastery' && <Sparkles className="mastery-sparkle" />}
              </div>
              <span className="hero-node-label">{node.label}</span>

              {isHovered && (
                <div className="hero-node-tooltip" role="tooltip">
                  <b>{node.title}</b>
                  <small>{node.type === 'root' ? 'Foundation Skill' : node.type === 'mastery' ? 'Capstone Goal' : 'Core Competency'}</small>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
