alter table public.scheme_catalog_sources drop constraint if exists scheme_catalog_sources_kind_check;
alter table public.scheme_catalog_sources add constraint scheme_catalog_sources_kind_check
  check(kind in ('pib_rss','document','official_search'));

insert into public.scheme_catalog_sources(id,label,url,kind,interval_minutes) values
  ('india-official-search','India-wide official scheme search','https://api.search.brave.com/res/v1/web/search','official_search',60)
on conflict(id) do nothing;
