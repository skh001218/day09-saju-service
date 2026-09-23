-- 과거 해석 행은 NULL을 유지한다. 새 유형은 서버가 내용과 중복 여부까지 검증한다.
alter table public.saju_interpretations
  add column compatible_types jsonb,
  add constraint saju_interpretations_compatible_types_shape_check check (
    case
      when compatible_types is null then true
      when jsonb_typeof(compatible_types) = 'array'
        then jsonb_array_length(compatible_types) between 2 and 3
      else false
    end
  );
