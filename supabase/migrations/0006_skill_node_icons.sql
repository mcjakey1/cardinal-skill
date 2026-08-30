alter table public.skill_nodes
  add column icon_key text
  check (icon_key is null or icon_key in (
    'pixel_dice', 'pixel_coin', 'pixel_grid', 'pixel_bar_chart', 'pixel_trophy',
    'pixel_boss_skull', 'pixel_cursor_arrow', 'pixel_brackets', 'pixel_scroll',
    'pixel_spellbook'
  ));

comment on column public.skill_nodes.icon_key is
  'Optional subject-specific pixel glyph selected during syllabus parsing.';
