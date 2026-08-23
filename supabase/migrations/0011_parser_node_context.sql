-- Preserve the syllabus context that the parser and study companion need.
alter table public.skill_nodes
  add column syllabus_topic text,
  add column universal_skill text,
  add column learning_objectives text[] not null default '{}';

alter table public.skill_nodes
  add constraint skill_nodes_syllabus_topic_length
    check (syllabus_topic is null or char_length(syllabus_topic) <= 240),
  add constraint skill_nodes_universal_skill_length
    check (universal_skill is null or char_length(universal_skill) <= 120),
  add constraint skill_nodes_learning_objectives_count
    check (cardinality(learning_objectives) <= 4);
