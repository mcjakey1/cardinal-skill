import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DM_Sans, DotGothic16 } from 'next/font/google'
import './globals.css'

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })

/**
 * The student app's face, loaded here for one purpose: the authoring canvas
 * draws the tree in the grammar a student receives it in, and that grammar is
 * set in DotGothic16. Nothing else in this workspace uses it.
 */
const chart = DotGothic16({ subsets: ['latin'], weight: '400', variable: '--font-dot' })

export const metadata: Metadata = {
  title: 'Instructor workspace · Cardinal Skill',
  description:
    'Author a course skill tree, review how a class is moving through it, and publish to students.',
}

const DIRECTION_CONTRACT = `<!--
DIRECTION CONTRACT — Cardinal Skill, instructor workspace

THESIS: The desk half of a product whose student half refuses ed-tech
  convention. Here convention is the commitment: an instructor fluent in Canvas
  should not have to learn a second interface to publish a syllabus.
OWN-WORLD: Cream ground #f7f3ea, surfaces #fffdf8, deep cardinal #981e2f, 8px
  radius, offset-and-blur shadows, DM Sans, lucide icons, dense data tables.
  One exception, load-bearing: the authoring canvas draws the tree in the
  student's sixteen-colour grammar, because an author must see what ships.
STORY: The instructor picks a course, sees whether its tree validates, reads the
  chart as their class will receive it, grafts help onto a hard node, publishes.
FIRST VIEWPORT: Left rail with course switcher, breadcrumb topbar, and a courses
  table whose last column is each tree's validation state.
FORM: The category standard, played straight — the standing exit, taken by the
  user over the dealt directions, so no direction roll ran. Craft bar set at
  Google Classroom, Stripe Dashboard and Canvas.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md.
-->`

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#981e2f',
  width: 'device-width',
  initialScale: 1,
  // `maximumScale: 1` used to sit here. It blocks pinch zoom, which is a
  // WCAG 1.4.4 failure on a screen full of 12–13px table text.
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${chart.variable}`}>
      <body>
        {/* A JSX comment is erased by the compiler, so the contract ships as
            real markup instead — a contract the build deletes is one nobody can
            audit against the render. */}
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
