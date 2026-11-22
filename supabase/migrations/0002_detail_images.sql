-- 상세이미지 저장소. Supabase SQL Editor에서 한 번 실행한다.
-- 파일 경로는 {사용자 ID}/{프로젝트 ID}/{실행 ID}/{번호}.png 이고, 첫 폴더가 자기 ID인 파일만 다룰 수 있다.

insert into storage.buckets (id, name, public)
values ('detail-images', 'detail-images', false)
on conflict (id) do nothing;

create policy detail_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'detail-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy detail_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'detail-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy detail_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'detail-images' and (storage.foldername(name))[1] = auth.uid()::text);
