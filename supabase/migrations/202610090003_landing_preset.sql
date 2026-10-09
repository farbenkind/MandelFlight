create table if not exists public.site_settings (
    setting_key text primary key check (setting_key = 'landing_preset'),
    setting_value jsonb not null,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint landing_preset_payload_shape check (
        setting_key <> 'landing_preset' or (
            setting_value ->> 'kind' = 'visual'
            and setting_value ->> 'schemaVersion' = '1'
            and jsonb_typeof(setting_value -> 'geometry' -> 'fractal') = 'object'
            and jsonb_typeof(setting_value -> 'color' -> 'knobs') = 'object'
            and jsonb_typeof(setting_value -> 'post' -> 'knobs') = 'object'
        ) is true
    ),
    constraint landing_preset_size_limit check (octet_length(setting_value::text) <= 200000)
);

alter table public.site_settings enable row level security;

drop policy if exists "Landing preset is publicly readable" on public.site_settings;
create policy "Landing preset is publicly readable"
    on public.site_settings for select
    using (setting_key = 'landing_preset');

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;

create or replace function public.set_landing_preset(preset_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := auth.uid();
begin
    if actor is null or not exists (
        select 1 from public.profiles where id = actor and is_admin
    ) then
        raise exception 'Administrator access required';
    end if;

    if jsonb_typeof(preset_payload) is distinct from 'object'
        or preset_payload ->> 'kind' is distinct from 'visual'
        or preset_payload ->> 'schemaVersion' is distinct from '1'
        or jsonb_typeof(preset_payload -> 'geometry' -> 'fractal') is distinct from 'object'
        or jsonb_typeof(preset_payload -> 'color' -> 'knobs') is distinct from 'object'
        or jsonb_typeof(preset_payload -> 'post' -> 'knobs') is distinct from 'object'
        or octet_length(preset_payload::text) > 200000
    then
        raise exception 'Invalid landing preset';
    end if;

    insert into public.site_settings (setting_key, setting_value, updated_by)
    values ('landing_preset', preset_payload, actor)
    on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

revoke all on function public.set_landing_preset(jsonb) from public, anon;
grant execute on function public.set_landing_preset(jsonb) to authenticated;
