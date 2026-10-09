create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default 'MandelFlight User' check (char_length(display_name) between 1 and 60),
    is_admin boolean not null default false,
    created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.profiles (id, display_name)
    values (
        new.id,
        left(coalesce(
            nullif(new.raw_user_meta_data ->> 'user_name', ''),
            nullif(new.raw_user_meta_data ->> 'name', ''),
            nullif(new.raw_user_meta_data ->> 'full_name', ''),
            'MandelFlight User'
        ), 60)
    ) on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_for_user();

insert into public.profiles (id, display_name)
select id, left(coalesce(
    nullif(raw_user_meta_data ->> 'user_name', ''),
    nullif(raw_user_meta_data ->> 'name', ''),
    nullif(raw_user_meta_data ->> 'full_name', ''),
    'MandelFlight User'
), 60)
from auth.users
on conflict (id) do nothing;

create table if not exists public.presets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 64),
    description text not null default '' check (char_length(description) <= 500),
    preset_kind text not null default 'visual' check (preset_kind in ('visual', 'geometry', 'color', 'post')),
    schema_version smallint not null default 1 check (schema_version > 0),
    preset_data jsonb not null,
    preview_palette jsonb not null default '{}'::jsonb,
    is_public boolean not null default false,
    featured boolean not null default false,
    featured_order integer not null default 0,
    likes integer not null default 0 check (likes >= 0),
    views integer not null default 0 check (views >= 0),
    saves integer not null default 0 check (saves >= 0),
    source_preset_id uuid references public.presets(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint visual_payload_shape check (
        preset_kind <> 'visual' or (
            preset_data ->> 'kind' = 'visual'
            and preset_data ->> 'schemaVersion' = schema_version::text
            and jsonb_typeof(preset_data -> 'geometry') = 'object'
            and jsonb_typeof(preset_data -> 'color') = 'object'
            and jsonb_typeof(preset_data -> 'post') = 'object'
        ) is true
    ),
    constraint preset_size_limit check (octet_length(preset_data::text) <= 200000)
);

create index if not exists presets_public_created_idx on public.presets (created_at desc) where is_public;
create index if not exists presets_featured_order_idx on public.presets (featured_order, created_at desc) where is_public and featured;
create index if not exists presets_owner_updated_idx on public.presets (owner_id, updated_at desc);

create table if not exists public.preset_likes (
    preset_id uuid not null references public.presets(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (preset_id, user_id)
);

create table if not exists public.preset_saves (
    source_preset_id uuid not null references public.presets(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    saved_preset_id uuid not null unique references public.presets(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (source_preset_id, user_id)
);

create table if not exists public.preset_views (
    preset_id uuid not null references public.presets(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    viewed_on date not null default current_date,
    primary key (preset_id, user_id, viewed_on)
);
create index if not exists preset_views_viewed_on_idx on public.preset_views (viewed_on);

create table if not exists public.preset_mutations (
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null default 'preset' check (kind in ('preset', 'like', 'report')),
    bucket_start timestamptz not null,
    event_count integer not null default 0 check (event_count >= 0),
    primary key (user_id, kind, bucket_start)
);

create table if not exists public.community_counters (
    name text primary key,
    value bigint not null default 0 check (value >= 0)
);
insert into public.community_counters (name, value)
values ('likes', 0), ('views', 0)
on conflict (name) do nothing;

create table if not exists public.problem_reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null check (char_length(title) between 3 and 120),
    description text not null check (char_length(description) between 10 and 5000),
    category text not null check (category in ('Bug', 'UI', 'Performance', 'Feature-Idee', 'Sonstiges')),
    app_version text not null check (char_length(app_version) <= 32),
    browser text not null check (char_length(browser) <= 500),
    operating_system text not null check (char_length(operating_system) <= 200),
    occurred_at timestamptz not null,
    preset_id uuid references public.presets(id) on delete set null,
    created_at timestamptz not null default now()
);
create index if not exists problem_reports_user_created_idx on public.problem_reports (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.presets enable row level security;
alter table public.preset_likes enable row level security;
alter table public.preset_saves enable row level security;
alter table public.preset_views enable row level security;
alter table public.preset_mutations enable row level security;
alter table public.community_counters enable row level security;
alter table public.problem_reports enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "Public presets and own presets are readable" on public.presets;
create policy "Public presets and own presets are readable" on public.presets for select using (is_public or owner_id = (select auth.uid()));
drop policy if exists "Users can create own presets" on public.presets;
create policy "Users can create own presets" on public.presets for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Users can update own presets" on public.presets;
create policy "Users can update own presets" on public.presets for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Users can delete own presets" on public.presets;
create policy "Users can delete own presets" on public.presets for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Likes are publicly readable" on public.preset_likes;
drop policy if exists "Users can read their own likes" on public.preset_likes;
create policy "Users can read their own likes" on public.preset_likes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can like as themselves" on public.preset_likes;
create policy "Users can like as themselves" on public.preset_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can remove their own likes" on public.preset_likes;
create policy "Users can remove their own likes" on public.preset_likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can read their saves" on public.preset_saves;
create policy "Users can read their saves" on public.preset_saves for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can read own views" on public.preset_views;
create policy "Users can read own views" on public.preset_views for select to authenticated using (user_id = (select auth.uid()));
create or replace function public.consume_user_rate_limit(p_user uuid, p_kind text, p_limit integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    hour_bucket timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
    events integer;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_kind, 0));
    delete from public.preset_mutations
    where user_id = p_user and kind = p_kind and bucket_start < hour_bucket - interval '30 days';
    select event_count into events from public.preset_mutations
    where user_id = p_user and kind = p_kind and bucket_start = hour_bucket;
    if coalesce(events, 0) >= p_limit then
        raise exception 'Rate limit reached (% per hour)', p_limit;
    end if;
    insert into public.preset_mutations (user_id, kind, bucket_start, event_count)
    values (p_user, p_kind, hour_bucket, 1)
    on conflict (user_id, kind, bucket_start)
    do update set event_count = public.preset_mutations.event_count + 1;
end;
$$;
revoke all on function public.consume_user_rate_limit(uuid, text, integer) from public, anon, authenticated;

drop policy if exists "Users can create own problem reports" on public.problem_reports;
create policy "Users can create own problem reports" on public.problem_reports for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can read own problem reports" on public.problem_reports;
create policy "Users can read own problem reports" on public.problem_reports for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.guard_preset_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    service_role boolean := coalesce(auth.jwt() ->> 'role' = 'service_role', false);
    owned_count integer;
    owned_bytes bigint;
    global_bytes bigint;
    excluded_id uuid;
    internal_counter boolean := coalesce(current_setting('mandelflight.counter_update', true) = 'on', false);
begin
    if actor is null and service_role then actor := new.owner_id; end if;
    if actor is null then raise exception 'Authentication required'; end if;
    if new.preset_kind <> 'visual' or new.schema_version <> 1 then
        raise exception 'Only version-1 Visual presets are currently supported';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
    new.preview_palette := jsonb_build_object(
        'amount-r', new.preset_data #> '{color,knobs,amount-r,cmValue}',
        'amount-g', new.preset_data #> '{color,knobs,amount-g,cmValue}',
        'amount-b', new.preset_data #> '{color,knobs,amount-b,cmValue}',
        'phaseShift', new.preset_data #> '{post,knobs,phaseShift,cmValue}'
    );

    if tg_op = 'UPDATE' then excluded_id := old.id; end if;
    if tg_op = 'UPDATE' and (
        new.owner_id <> old.owner_id
        or ((new.likes <> old.likes or new.views <> old.views or new.saves <> old.saves)
            and not internal_counter)
        or (
            (new.featured <> old.featured or new.featured_order <> old.featured_order)
            and (
                current_setting('mandelflight.admin_update', true) is distinct from 'on'
                or not exists (select 1 from public.profiles where id = actor and is_admin)
            )
        )
        or (old.featured and not new.is_public
            and current_setting('mandelflight.admin_update', true) is distinct from 'on')
        or new.created_at <> old.created_at or new.source_preset_id is distinct from old.source_preset_id
        or new.preset_kind <> old.preset_kind or new.schema_version <> old.schema_version
    ) then
        raise exception 'Server-managed preset fields cannot be changed';
    end if;

    if internal_counter then return new; end if;

    select count(*), coalesce(sum(octet_length(preset_data::text)), 0)
    into owned_count, owned_bytes from public.presets
    where owner_id = actor and id is distinct from excluded_id;
    if tg_op = 'INSERT' and owned_count >= 50 then
        raise exception 'Preset limit reached (50 per account)';
    end if;
    if owned_bytes + octet_length(new.preset_data::text) > 5000000 then
        raise exception 'Account storage limit reached (5 MB)';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('mandelflight/global-preset-storage', 0));
    select coalesce(sum(octet_length(preset_data::text)), 0)
    into global_bytes from public.presets where id is distinct from excluded_id;
    if global_bytes + octet_length(new.preset_data::text) > 300000000 then
        raise exception 'Community preset storage limit reached (300 MB)';
    end if;

    if not service_role and (tg_op = 'INSERT' or new.preset_data is distinct from old.preset_data or new.name is distinct from old.name
        or new.description is distinct from old.description or new.is_public is distinct from old.is_public) then
        perform public.consume_user_rate_limit(actor, 'preset', 30);
    end if;
    new.updated_at := now();
    return new;
end;
$$;
drop trigger if exists preset_write_guard on public.presets;
create trigger preset_write_guard before insert or update on public.presets
for each row execute function public.guard_preset_write();

create or replace function public.update_preset_like_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    changed boolean;
begin
    if tg_op = 'INSERT' then
        perform set_config('mandelflight.counter_update', 'on', true);
        update public.presets set likes = likes + 1 where id = new.preset_id and is_public;
        changed := found;
        perform set_config('mandelflight.counter_update', 'off', true);
        if not changed then raise exception 'Preset not found or private'; end if;
        return new;
    end if;
    perform set_config('mandelflight.counter_update', 'on', true);
    update public.presets set likes = greatest(0, likes - 1) where id = old.preset_id;
    perform set_config('mandelflight.counter_update', 'off', true);
    update public.community_counters set value = greatest(0, value - 1) where name = 'likes';
    return old;
end;
$$;
drop trigger if exists preset_like_count on public.preset_likes;
create trigger preset_like_count after insert or delete on public.preset_likes
for each row execute function public.update_preset_like_count();

create or replace function public.guard_preset_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    author uuid;
begin
    if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Authentication required'; end if;
    perform pg_advisory_xact_lock(hashtextextended(new.preset_id::text || new.user_id::text, 3));
    if exists (
        select 1 from public.preset_likes
        where preset_id = new.preset_id and user_id = new.user_id
    ) then return null; end if;
    select owner_id into author from public.presets where id = new.preset_id and is_public;
    if author is null then raise exception 'Preset not found or private'; end if;
    if author = auth.uid() then raise exception 'Cannot like your own preset'; end if;
    perform public.consume_user_rate_limit(auth.uid(), 'like', 60);
    update public.community_counters set value = value + 1
    where name = 'likes' and value < 250000;
    if not found then raise exception 'Community like storage limit reached'; end if;
    return new;
end;
$$;
drop trigger if exists preset_like_guard on public.preset_likes;
create trigger preset_like_guard before insert on public.preset_likes
for each row execute function public.guard_preset_like();

create or replace function public.update_preset_save_count()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        perform set_config('mandelflight.counter_update', 'on', true);
        update public.presets set saves = saves + 1 where id = new.source_preset_id;
        perform set_config('mandelflight.counter_update', 'off', true);
        return new;
    end if;
    perform set_config('mandelflight.counter_update', 'on', true);
    update public.presets set saves = greatest(0, saves - 1) where id = old.source_preset_id;
    perform set_config('mandelflight.counter_update', 'off', true);
    return old;
end;
$$;
drop trigger if exists preset_save_count on public.preset_saves;
create trigger preset_save_count after insert or delete on public.preset_saves
for each row execute function public.update_preset_save_count();

create or replace function public.save_community_preset(source_preset uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    source public.presets%rowtype;
    copy_id uuid;
begin
    if actor is null then raise exception 'Authentication required'; end if;
    select * into source from public.presets where id = source_preset and is_public;
    if not found then raise exception 'Public preset not found'; end if;
    if source.owner_id = actor then raise exception 'Cannot save your own preset'; end if;
    perform pg_advisory_xact_lock(hashtextextended(actor::text || source.id::text, 0));
    select saved_preset_id into copy_id from public.preset_saves
    where source_preset_id = source.id and user_id = actor;
    if found then return copy_id; end if;
    insert into public.presets (owner_id, name, description, preset_kind, schema_version, preset_data)
    values (actor, left(source.name, 56) || ' (Copy)', source.description, source.preset_kind, source.schema_version, source.preset_data)
    returning id into copy_id;
    insert into public.preset_saves(source_preset_id, user_id, saved_preset_id)
    values (source.id, actor, copy_id);
    return copy_id;
end;
$$;
grant execute on function public.save_community_preset(uuid) to authenticated;

create or replace function public.decrement_view_storage()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    if current_setting('mandelflight.view_discard', true) is distinct from 'on' then
        update public.community_counters set value = greatest(0, value - 1) where name = 'views';
    end if;
    return old;
end;
$$;
drop trigger if exists preset_view_storage_decrement on public.preset_views;
create trigger preset_view_storage_decrement after delete on public.preset_views
for each row execute function public.decrement_view_storage();

create or replace function public.record_preset_view(viewed_preset uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    inserted_view boolean;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    delete from public.preset_views where viewed_on < current_date - 30;
    insert into public.preset_views(preset_id, user_id, viewed_on)
    select id, auth.uid(), current_date from public.presets where id = viewed_preset and is_public
    on conflict do nothing
    returning true into inserted_view;
    if found then
        update public.community_counters set value = value + 1
        where name = 'views' and value < 250000;
        if found then
            perform set_config('mandelflight.counter_update', 'on', true);
            update public.presets set views = views + 1 where id = viewed_preset;
            perform set_config('mandelflight.counter_update', 'off', true);
        else
            perform set_config('mandelflight.view_discard', 'on', true);
            delete from public.preset_views
            where preset_id = viewed_preset and user_id = auth.uid() and viewed_on = current_date;
            perform set_config('mandelflight.view_discard', 'off', true);
        end if;
    end if;
end;
$$;
grant execute on function public.record_preset_view(uuid) to authenticated;

create or replace function public.set_preset_featured(preset_uuid uuid, is_featured boolean, display_order integer default 0)
returns void language plpgsql security definer set search_path = ''
as $$
begin
    if auth.uid() is null or not exists (
        select 1 from public.profiles where id = auth.uid() and is_admin
    ) then raise exception 'Administrator access required'; end if;
    perform set_config('mandelflight.admin_update', 'on', true);
    update public.presets
    set featured = is_featured, featured_order = display_order,
        is_public = case when is_featured then true else is_public end
    where id = preset_uuid;
    if not found then raise exception 'Preset not found'; end if;
    perform set_config('mandelflight.admin_update', 'off', true);
end;
$$;
grant execute on function public.set_preset_featured(uuid, boolean, integer) to authenticated;

create or replace function public.guard_problem_report()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    report_bytes bigint;
begin
    if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Authentication required'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mandelflight/global-report-storage', 0));
    if (select count(*) from public.problem_reports where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
        raise exception 'Problem report limit reached (5 per day)';
    end if;
    perform public.consume_user_rate_limit(auth.uid(), 'report', 5);
    select coalesce(sum(octet_length(title) + octet_length(description)), 0)
    into report_bytes from public.problem_reports;
    if report_bytes + octet_length(new.title) + octet_length(new.description) > 25000000 then
        raise exception 'Problem report storage limit reached (25 MB)';
    end if;
    if new.preset_id is not null and not exists (
        select 1 from public.presets where id = new.preset_id and (is_public or owner_id = auth.uid())
    ) then new.preset_id := null; end if;
    return new;
end;
$$;
drop trigger if exists problem_report_guard on public.problem_reports;
create trigger problem_report_guard before insert on public.problem_reports
for each row execute function public.guard_problem_report();

revoke all on public.preset_mutations, public.preset_views, public.preset_saves, public.community_counters from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.profiles, public.presets, public.preset_likes to anon, authenticated;
grant insert, update, delete on public.presets to authenticated;
grant select, insert, delete on public.preset_likes to authenticated;
grant select, insert on public.problem_reports to authenticated;
