-- 과거 해석 행은 NULL을 유지하고, 새 추천은 직업과 이유를 한 쌍으로 저장한다.
alter table public.saju_interpretations
  add column recommended_class text,
  add column recommendation_reason text,
  add constraint saju_interpretations_recommendation_pair_check check (
    (recommended_class is null and recommendation_reason is null) or
    (recommended_class is not null and recommendation_reason is not null and
      char_length(btrim(recommended_class)) between 1 and 100 and
      char_length(btrim(recommendation_reason)) between 10 and 300)
  );
