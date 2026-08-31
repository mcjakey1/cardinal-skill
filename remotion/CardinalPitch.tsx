import React, {type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const palette = {
  paper: '#f4f1ea',
  paperBright: '#fbfaf7',
  ink: '#171511',
  muted: '#726f68',
  line: '#d8d3ca',
  orange: '#f15a00',
  orangeSoft: '#ffdec9',
  screen: '#12100f',
  green: '#27bd7c',
};

const asset = (name: string) => staticFile(`cardinal-pitch/${name}`);

const ease = Easing.bezier(0.22, 1, 0.36, 1);

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 12, duration - 14, duration], [0, 1, 1, 0], clamp);

const serif: CSSProperties = {
  fontFamily: 'Georgia, Times New Roman, serif',
  fontWeight: 400,
  letterSpacing: '-0.045em',
};

const sans: CSSProperties = {
  fontFamily: 'Arial, Helvetica, sans-serif',
};

const Label: React.FC<{children: ReactNode; color?: string}> = ({children, color}) => (
  <div
    style={{
      ...sans,
      color: color ?? palette.orange,
      fontSize: 24,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const ProductWindow: React.FC<{
  src: string;
  title?: string;
  width?: number;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
  glow?: boolean;
}> = ({src, title = 'Cardinal Skill', width = 1540, style, imageStyle, glow = false}) => (
  <div
    style={{
      width,
      overflow: 'hidden',
      borderRadius: 28,
      border: `1px solid ${palette.line}`,
      background: palette.screen,
      boxShadow: glow
        ? '0 34px 100px rgba(241, 90, 0, 0.2), 0 12px 42px rgba(23, 21, 17, 0.16)'
        : '0 28px 80px rgba(23, 21, 17, 0.14), 0 8px 26px rgba(23, 21, 17, 0.08)',
      ...style,
    }}
  >
    <div
      style={{
        ...sans,
        height: 54,
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '0 22px',
        color: '#69645c',
        background: '#edeae4',
        borderBottom: `1px solid ${palette.line}`,
        fontSize: 18,
      }}
    >
      <span style={{width: 12, height: 12, borderRadius: 99, background: '#c9c3b9'}} />
      <span style={{width: 12, height: 12, borderRadius: 99, background: '#c9c3b9'}} />
      <span style={{width: 12, height: 12, borderRadius: 99, background: '#c9c3b9'}} />
      <span style={{marginLeft: 14}}>{title}</span>
    </div>
    <Img
      src={src}
      style={{width: '100%', display: 'block', objectFit: 'cover', ...imageStyle}}
    />
  </div>
);

const OpeningScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const logo = spring({frame: frame - 8, fps, config: {damping: 18, stiffness: 90}});
  const headline = spring({frame: frame - 22, fps, config: {damping: 20, stiffness: 75}});
  const preview = spring({frame: frame - 54, fps, config: {damping: 22, stiffness: 85}});

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity(frame, duration),
        background: palette.paper,
        color: palette.ink,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 96,
          display: 'flex',
          alignItems: 'center',
          padding: '10px 18px',
          borderRadius: 16,
          background: palette.ink,
          boxShadow: '0 12px 30px rgba(25, 22, 19, 0.12)',
          opacity: logo,
          transform: `translateY(${interpolate(logo, [0, 1], [16, 0])}px)`,
        }}
      >
        <Img src={asset('cardinal_logo_transparent.png.png')} style={{width: 220}} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 280,
          width: 1110,
          opacity: headline,
          transform: `translateY(${interpolate(headline, [0, 1], [48, 0])}px)`,
        }}
      >
        <div style={{...serif, fontSize: 112, lineHeight: 0.98}}>
          From syllabus
          <br />
          to <span style={{color: palette.orange}}>momentum.</span>
        </div>
        <div style={{...sans, marginTop: 36, fontSize: 28, color: palette.muted, lineHeight: 1.4}}>
          Cardinal Skill turns course requirements into a clear,
          <br />
          navigable path to mastery.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: -250,
          bottom: -250,
          opacity: preview,
          transform: `translate(${interpolate(preview, [0, 1], [130, 0])}px, ${interpolate(
            preview,
            [0, 1],
            [70, 0],
          )}px) rotate(-5deg) scale(0.72)`,
        }}
      >
        <ProductWindow src={asset('cardinal_landing_screen.png')} width={1160} glow />
      </div>
    </AbsoluteFill>
  );
};

const PromptScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const card = spring({frame: frame - 10, fps, config: {damping: 20, stiffness: 90}});
  const file = spring({frame: frame - 36, fps, config: {damping: 18, stiffness: 110}});
  const action = spring({frame: frame - 72, fps, config: {damping: 16, stiffness: 120}});

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity(frame, duration),
        background: palette.paperBright,
        color: palette.ink,
      }}
    >
      <div style={{position: 'absolute', left: 0, right: 0, top: 116, textAlign: 'center'}}>
        <Label>One upload</Label>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 1140,
          minHeight: 510,
          padding: 58,
          border: `1px solid ${palette.line}`,
          borderRadius: 34,
          background: '#fff',
          boxShadow: '0 26px 90px rgba(23, 21, 17, 0.10)',
          transform: `translate(-50%, -48%) scale(${interpolate(card, [0, 1], [0.92, 1])})`,
          opacity: card,
        }}
      >
        <div
          style={{
            ...sans,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
            borderRadius: 18,
            padding: '15px 20px',
            background: '#f1efeb',
            color: '#4b4842',
            fontSize: 21,
            opacity: file,
            transform: `translateY(${interpolate(file, [0, 1], [18, 0])}px)`,
          }}
        >
          <span style={{fontWeight: 800, color: palette.orange}}>PDF</span>
          Discrete Mathematics — Course Syllabus
          <span style={{color: '#aaa49a'}}>8.2 MB</span>
        </div>

        <div style={{...sans, marginTop: 46, fontSize: 41, lineHeight: 1.36, maxWidth: 930}}>
          Build the learning map for this course.
          <br />
          <b>Extract prerequisites, create missions, and show every student what unlocks next.</b>
        </div>

        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 62}}>
          <div style={{...sans, color: palette.muted, fontSize: 23}}>AI-assisted course mapping</div>
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 99,
              display: 'grid',
              placeItems: 'center',
              background: palette.orange,
              color: '#fff',
              fontSize: 38,
              opacity: action,
              transform: `scale(${interpolate(action, [0, 1], [0.65, 1])})`,
              boxShadow: '0 12px 32px rgba(241, 90, 0, 0.28)',
            }}
          >
            ↑
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const MapRevealScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = spring({frame: frame - 8, fps, config: {damping: 22, stiffness: 70}});
  const screen = spring({frame: frame - 54, fps, config: {damping: 24, stiffness: 75}});
  const scale = interpolate(frame, [54, duration - 6], [0.86, 1.02], {...clamp, easing: ease});

  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, duration), background: palette.paper, overflow: 'hidden'}}>
      <div
        style={{
          ...serif,
          position: 'absolute',
          left: 0,
          right: 0,
          top: 128,
          color: palette.ink,
          textAlign: 'center',
          fontSize: 108,
          lineHeight: 1,
          opacity: words,
          transform: `translateY(${interpolate(words, [0, 1], [36, 0])}px)`,
        }}
      >
        A syllabus becomes a <span style={{color: palette.orange}}>map.</span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 410,
          opacity: screen,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'center top',
        }}
      >
        <ProductWindow src={asset('cardinal_skill_tree_view.png')} width={1520} glow />
      </div>
    </AbsoluteFill>
  );
};

const SkillTreeScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, duration], [1.04, 1.13], {...clamp, easing: Easing.linear});
  const pan = interpolate(frame, [0, duration], [28, -46], clamp);
  const tags = [
    {text: 'Prerequisites', x: 222, y: 210, delay: 20},
    {text: 'Unlocks', x: 1220, y: 330, delay: 46},
    {text: 'Mastery', x: 1380, y: 744, delay: 72},
  ];

  return (
    <AbsoluteFill
      style={{opacity: sceneOpacity(frame, duration), background: '#0d0c0b', overflow: 'hidden'}}
    >
      <Img
        src={asset('cardinal_skill_tree_view.png')}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translateX(${pan}px) scale(${zoom})`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(8,7,7,.42), transparent 28%, transparent 72%, rgba(8,7,7,.35))',
        }}
      />

      {tags.map((tag) => {
        const progress = interpolate(frame, [tag.delay, tag.delay + 16], [0, 1], clamp);
        return (
          <div
            key={tag.text}
            style={{
              position: 'absolute',
              left: tag.x,
              top: tag.y,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              opacity: progress,
              transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)`,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 99,
                background: palette.orange,
                boxShadow: '0 0 22px rgba(241,90,0,.8)',
              }}
            />
            <span
              style={{
                ...sans,
                padding: '12px 18px',
                borderRadius: 12,
                background: 'rgba(11,10,9,.82)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,.16)',
                fontSize: 23,
                fontWeight: 700,
              }}
            >
              {tag.text}
            </span>
          </div>
        );
      })}

      <div style={{position: 'absolute', left: 74, bottom: 64}}>
        <Label color="#ff7a2d">A visible path through the course</Label>
      </div>
    </AbsoluteFill>
  );
};

const ProcessCard: React.FC<{
  frame: number;
  delay: number;
  title: string;
  detail: string;
  progress: number;
}> = ({frame, delay, title, detail, progress}) => {
  const p = interpolate(frame, [delay, delay + 18], [0, 1], clamp);
  const liveProgress = interpolate(frame, [delay + 12, delay + 64], [0, progress], clamp);
  return (
    <div
      style={{
        width: 680,
        padding: '28px 30px 24px',
        borderRadius: 24,
        border: `1px solid ${palette.line}`,
        background: '#fff',
        boxShadow: '0 12px 34px rgba(23,21,17,.08)',
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px)`,
      }}
    >
      <div style={{...sans, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
        <div style={{fontSize: 28, fontWeight: 750, color: palette.ink}}>{title}</div>
        <div style={{fontSize: 19, color: palette.muted}}>{detail}</div>
      </div>
      <div style={{height: 8, background: '#ebe7df', borderRadius: 99, overflow: 'hidden', marginTop: 20}}>
        <div
          style={{
            width: `${liveProgress * 100}%`,
            height: '100%',
            background: palette.orange,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
};

const ProcessScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const screenshot = interpolate(frame, [42, 68], [0, 1], clamp);
  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, duration), background: palette.paperBright}}>
      <div style={{position: 'absolute', left: 100, top: 90}}>
        <Label>Built in seconds</Label>
        <div style={{...serif, color: palette.ink, fontSize: 76, lineHeight: 1.04, marginTop: 28}}>
          From document
          <br />
          to direction.
        </div>
      </div>

      <div style={{position: 'absolute', left: 100, top: 390, display: 'grid', gap: 20}}>
        <ProcessCard frame={frame} delay={12} title="Read the syllabus" detail="Course structure" progress={1} />
        <ProcessCard frame={frame} delay={30} title="Map dependencies" detail="Prerequisite graph" progress={1} />
        <ProcessCard frame={frame} delay={48} title="Create missions" detail="Ready to learn" progress={0.84} />
      </div>

      <div
        style={{
          position: 'absolute',
          right: -80,
          top: 196,
          opacity: screenshot,
          transform: `translateX(${interpolate(screenshot, [0, 1], [100, 0])}px) scale(.74) rotate(2deg)`,
        }}
      >
        <ProductWindow src={asset('cardinal_parsing_sample_loading.png')} width={1260} glow />
      </div>
    </AbsoluteFill>
  );
};

const MissionsScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const left = spring({frame: frame - 20, fps, config: {damping: 20, stiffness: 80}});
  const right = spring({frame: frame - 70, fps, config: {damping: 20, stiffness: 80}});
  const copy = interpolate(frame, [0, 22], [0, 1], clamp);

  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, duration), background: palette.paper, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 92, top: 72, zIndex: 3}}>
        <Label>Learning that moves</Label>
        <div style={{...serif, marginTop: 24, color: palette.ink, fontSize: 78, opacity: copy}}>
          Every node becomes an action.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 84,
          top: 280,
          opacity: left,
          transform: `translateX(${interpolate(left, [0, 1], [-100, 0])}px) scale(.76)`,
          transformOrigin: 'left top',
        }}
      >
        <ProductWindow
          src={asset('cardinal_node_mission.png')}
          title="Mission workspace"
          width={1180}
          glow
        />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 58,
          top: 380,
          opacity: right,
          transform: `translateX(${interpolate(right, [0, 1], [100, 0])}px) scale(.7)`,
          transformOrigin: 'right top',
        }}
      >
        <ProductWindow
          src={asset('cardinal_ai_study_companion_sample.png')}
          title="AI study companion"
          width={1180}
          glow
        />
      </div>

      <div
        style={{
          ...sans,
          position: 'absolute',
          right: 96,
          top: 196,
          width: 610,
          color: palette.ink,
          fontSize: 25,
          lineHeight: 1.35,
          textAlign: 'right',
          opacity: right,
        }}
      >
        Mission context, criteria, hints, and an AI companion—without leaving the learning map.
      </div>
    </AbsoluteFill>
  );
};

const GridTile: React.FC<{
  frame: number;
  delay: number;
  src: string;
  title: string;
  x: number;
  y: number;
  width: number;
}> = ({frame, delay, src, title, x, y, width}) => {
  const p = interpolate(frame, [delay, delay + 18], [0, 1], clamp);
  const drift = interpolate(frame, [delay, 240], [12, -12], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + drift,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [48, 0])}px)`,
      }}
    >
      <ProductWindow src={src} title={title} width={width} />
    </div>
  );
};

const SystemScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const headline = interpolate(frame, [0, 18], [0, 1], clamp);
  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, duration), background: palette.paperBright, overflow: 'hidden'}}>
      <div
        style={{
          ...serif,
          position: 'absolute',
          left: 98,
          top: 84,
          width: 760,
          color: palette.ink,
          fontSize: 82,
          lineHeight: 1,
          opacity: headline,
        }}
      >
        One course.
        <br />
        Every learning surface.
      </div>
      <div style={{position: 'absolute', right: 102, top: 118}}>
        <Label>Student + instructor</Label>
      </div>

      <GridTile
        frame={frame}
        delay={18}
        src={asset('cardinal_my_courses_page.png')}
        title="Courses"
        x={76}
        y={420}
        width={820}
      />
      <GridTile
        frame={frame}
        delay={38}
        src={asset('cardinal_record_tab_leaderboard.png')}
        title="Progress"
        x={958}
        y={310}
        width={820}
      />
      <GridTile
        frame={frame}
        delay={58}
        src={asset('cardinal_settings_themes.png')}
        title="Themes"
        x={160}
        y={860}
        width={730}
      />
      <GridTile
        frame={frame}
        delay={78}
        src={asset('cardinal_instructor_dashboard_student_insight.png')}
        title="Student insights"
        x={1000}
        y={760}
        width={760}
      />
    </AbsoluteFill>
  );
};

const InstructorScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const copy = spring({frame: frame - 8, fps, config: {damping: 20, stiffness: 74}});
  const screen = spring({frame: frame - 34, fps, config: {damping: 22, stiffness: 84}});
  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, duration), background: palette.paper, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: 94,
          top: 106,
          width: 650,
          opacity: copy,
          transform: `translateY(${interpolate(copy, [0, 1], [30, 0])}px)`,
        }}
      >
        <Label>Instructor intelligence</Label>
        <div style={{...serif, color: palette.ink, fontSize: 86, lineHeight: 1.03, marginTop: 30}}>
          See where the class is stuck.
        </div>
        <div style={{...sans, marginTop: 32, color: palette.muted, fontSize: 27, lineHeight: 1.45}}>
          Spot difficult concepts, review student progress, and intervene before learners fall behind.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: -250,
          top: 190,
          opacity: screen,
          transform: `translateX(${interpolate(screen, [0, 1], [150, 0])}px) scale(.82) rotate(-1.5deg)`,
          transformOrigin: 'right top',
        }}
      >
        <ProductWindow
          src={asset('cardinal_instructor_dashboard_class_insight.png')}
          title="Class insights"
          width={1480}
          glow
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 88,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <span style={{width: 12, height: 12, borderRadius: 99, background: palette.green}} />
        <span style={{...sans, color: palette.ink, fontSize: 22, fontWeight: 700}}>Live course signals</span>
      </div>
    </AbsoluteFill>
  );
};

const ClosingScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const mark = spring({frame: frame - 18, fps, config: {damping: 24, stiffness: 65}});
  const copy = spring({frame: frame - 54, fps, config: {damping: 22, stiffness: 70}});
  const blur = interpolate(frame, [10, 64], [24, 0], clamp);

  return (
    <AbsoluteFill style={{background: palette.paperBright, color: palette.ink}}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '44%',
          opacity: mark,
          filter: `blur(${blur}px)`,
          transform: `translate(-50%, -50%) scale(${interpolate(mark, [0, 1], [0.88, 1])})`,
        }}
      >
        <div
          style={{
            padding: '34px 54px',
            borderRadius: 30,
            background: palette.ink,
            boxShadow: '0 28px 90px rgba(241, 90, 0, 0.15)',
          }}
        >
          <Img src={asset('cardinal_logo_transparent.png.png')} style={{width: 670, display: 'block'}} />
        </div>
      </div>
      <div
        style={{
          ...serif,
          position: 'absolute',
          left: 0,
          right: 0,
          top: 660,
          textAlign: 'center',
          fontSize: 70,
          opacity: copy,
          transform: `translateY(${interpolate(copy, [0, 1], [28, 0])}px)`,
        }}
      >
        Learning, <span style={{color: palette.orange}}>mapped.</span>
      </div>
      <div
        style={{
          ...sans,
          position: 'absolute',
          left: 0,
          right: 0,
          top: 770,
          textAlign: 'center',
          fontSize: 25,
          color: palette.muted,
          opacity: copy,
        }}
      >
        Turn any syllabus into a path students can follow.
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 104,
          width: 110,
          height: 5,
          borderRadius: 99,
          background: palette.orange,
          transform: `translateX(-50%) scaleX(${copy})`,
        }}
      />
    </AbsoluteFill>
  );
};

const scenes = [
  {start: 0, duration: 105, component: OpeningScene},
  {start: 105, duration: 150, component: PromptScene},
  {start: 255, duration: 135, component: MapRevealScene},
  {start: 390, duration: 180, component: SkillTreeScene},
  {start: 570, duration: 150, component: ProcessScene},
  {start: 720, duration: 210, component: MissionsScene},
  {start: 930, duration: 240, component: SystemScene},
  {start: 1170, duration: 150, component: InstructorScene},
  {start: 1320, duration: 120, component: ClosingScene},
];

export const CardinalPitch: React.FC = () => {
  return (
    <AbsoluteFill style={{background: palette.paper}}>
      <Audio
        name="Perplexity reference soundtrack"
        src={asset('perplexity_computer.mp4')}
        trimAfter={1440}
        volume={(frame) =>
          interpolate(frame, [0, 36, 1374, 1439], [0, 0.82, 0.82, 0], clamp)
        }
      />
      {scenes.map(({start, duration, component: Component}) => (
        <Sequence key={start} from={start} durationInFrames={duration} premountFor={15}>
          <Component duration={duration} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
