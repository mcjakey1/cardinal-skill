-- Parser versions before v31 scaled mission XP from difficulty but omitted the
-- difficulty column on insert. Restore the same scale for existing courses.

update public.missions
set difficulty = case
  when xp_reward >= 75 then 'hard'
  when xp_reward <= 30 then 'easy'
  else 'medium'
end
where difficulty is null;
