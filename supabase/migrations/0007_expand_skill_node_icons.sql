alter table public.skill_nodes
  drop constraint if exists skill_nodes_icon_key_check;

alter table public.skill_nodes
  add constraint skill_nodes_icon_key_check check (icon_key is null or icon_key in (
    'pixel_dice', 'pixel_coin', 'pixel_grid', 'pixel_bar_chart', 'pixel_trophy',
    'pixel_boss_skull', 'pixel_cursor_arrow', 'pixel_brackets', 'pixel_scroll',
    'pixel_spellbook', 'pixel_binary_tree', 'pixel_pointer', 'pixel_chip',
    'pixel_circuit', 'pixel_gate', 'pixel_potion', 'pixel_flask', 'pixel_atom'
  ));
