begin;

-- Existing data remains in A. B belongs to the same authenticated owner,
-- but is only accessible to eligible admins acting as a private test user.
alter table public.presets add column dataset text not null default 'A'
    check (dataset in ('A', 'B'));
alter table public.presets add constraint test_presets_stay_private
    check (dataset = 'A' or (not is_public and not featured));
alter table public.preset_likes add column dataset text not null default 'A'
    check (dataset in ('A', 'B'));
alter table public.preset_saves add column dataset text not null default 'A'
    check (dataset in ('A', 'B'));
alter table public.preset_views add column dataset text not null default 'A'
    check (dataset in ('A', 'B'));
alter table public.preset_likes drop constraint preset_likes_pkey;
alter table public.preset_likes add primary key (preset_id, user_id, dataset);
alter table public.preset_saves drop constraint preset_saves_pkey;
alter table public.preset_saves add primary key (source_preset_id, user_id, dataset);
alter table public.preset_views drop constraint preset_views_pkey;
alter table public.preset_views add primary key (preset_id, user_id, dataset, viewed_on);
create index presets_owner_dataset_idx on public.presets (owner_id, dataset, updated_at desc);

create function public.workspace_mode()
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
    headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    requested text := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-mandelflight-mode',
        'user'
    );
begin
    if headers ? 'x-mandelflight-user'
        and (auth.uid() is null or headers ->> 'x-mandelflight-user' <> auth.uid()::text) then
        raise exception 'Authenticated account changed during request';
    end if;
    if requested not in ('user', 'admin', 'test') then
        raise exception 'Invalid workspace mode';
    end if;
    if requested <> 'user' and not exists (
        select 1 from public.profiles where id = auth.uid() and is_admin
    ) then raise exception 'Administrator eligibility required for this workspace'; end if;
    return requested;
end;
$$;

create function public.workspace_dataset()
returns text language sql stable security definer set search_path = ''
as $$ select case when public.workspace_mode() = 'test' then 'B' else 'A' end $$;

create function public.get_workspace_access()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    return jsonb_build_object(
        'can_admin', exists (select 1 from public.profiles where id = auth.uid() and is_admin),
        'mode', public.workspace_mode(),
        'dataset', public.workspace_dataset()
    );
end;
$$;
revoke all on function public.get_workspace_access() from public, anon;
grant execute on function public.get_workspace_access() to authenticated;

drop policy "Public presets and own presets are readable" on public.presets;
create policy "Public presets and own presets are readable" on public.presets for select
using ((is_public and dataset = 'A') or (owner_id = auth.uid() and dataset = public.workspace_dataset()));
drop policy "Users can create own presets" on public.presets;
create policy "Users can create own presets" on public.presets for insert to authenticated
with check (owner_id = auth.uid() and dataset = public.workspace_dataset());
drop policy "Users can update own presets" on public.presets;
create policy "Users can update own presets" on public.presets for update to authenticated
using (owner_id = auth.uid() and dataset = public.workspace_dataset())
with check (owner_id = auth.uid() and dataset = public.workspace_dataset());
drop policy "Users can delete own presets" on public.presets;
create policy "Users can delete own presets" on public.presets for delete to authenticated
using (owner_id = auth.uid() and dataset = public.workspace_dataset());

drop policy "Users can read their own likes" on public.preset_likes;
create policy "Users can read their own likes" on public.preset_likes for select to authenticated
using (user_id = auth.uid() and dataset = public.workspace_dataset());
drop policy "Users can like as themselves" on public.preset_likes;
create policy "Users can like as themselves" on public.preset_likes for insert to authenticated
with check (user_id = auth.uid() and dataset = public.workspace_dataset());
drop policy "Users can remove their own likes" on public.preset_likes;
create policy "Users can remove their own likes" on public.preset_likes for delete to authenticated
using (user_id = auth.uid() and dataset = public.workspace_dataset());
drop policy "Users can read their saves" on public.preset_saves;
create policy "Users can read their saves" on public.preset_saves for select to authenticated
using (user_id = auth.uid() and dataset = public.workspace_dataset());
drop policy "Users can read own views" on public.preset_views;
create policy "Users can read own views" on public.preset_views for select to authenticated
using (user_id = auth.uid() and dataset = public.workspace_dataset());

create function public.guard_preset_workspace()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' and new.dataset is distinct from old.dataset then
        raise exception 'Preset dataset cannot be changed';
    end if;
    if current_setting('mandelflight.counter_update', true) = 'on' then return new; end if;
    if auth.jwt() ->> 'role' = 'service_role' then return new; end if;
    if current_setting('mandelflight.admin_update', true) = 'on' then
        if public.workspace_mode() <> 'admin' then raise exception 'Active admin workspace required'; end if;
    elsif new.owner_id <> auth.uid() or new.dataset <> public.workspace_dataset() then
        raise exception 'Preset does not belong to the active workspace';
    end if;
    return new;
end;
$$;
create trigger preset_workspace_guard before insert or update on public.presets
for each row execute function public.guard_preset_workspace();

-- Keep the established payload, quota and counter guards. Administrative
-- entry points additionally require the explicit admin workspace.
alter function public.set_preset_featured(uuid, boolean, integer) rename to set_preset_featured_internal;
revoke all on function public.set_preset_featured_internal(uuid, boolean, integer) from public, anon, authenticated;
create function public.set_preset_featured(preset_uuid uuid, is_featured boolean, display_order integer default 0)
returns void language plpgsql security definer set search_path = ''
as $$
begin
    if public.workspace_mode() <> 'admin' then raise exception 'Active admin workspace required'; end if;
    perform public.set_preset_featured_internal(preset_uuid, is_featured, display_order);
end;
$$;
revoke all on function public.set_preset_featured(uuid, boolean, integer) from public, anon;
grant execute on function public.set_preset_featured(uuid, boolean, integer) to authenticated;

alter function public.set_landing_preset(jsonb) rename to set_landing_preset_internal;
revoke all on function public.set_landing_preset_internal(jsonb) from public, anon, authenticated;
create function public.set_landing_preset(preset_payload jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
    if public.workspace_mode() <> 'admin' then raise exception 'Active admin workspace required'; end if;
    perform public.set_landing_preset_internal(preset_payload);
end;
$$;
revoke all on function public.set_landing_preset(jsonb) from public, anon;
grant execute on function public.set_landing_preset(jsonb) to authenticated;

create or replace function public.guard_preset_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    author uuid;
    source_dataset text;
begin
    if auth.uid() is null or new.user_id <> auth.uid() or new.dataset <> public.workspace_dataset() then
        raise exception 'Authentication and active workspace required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(new.preset_id::text || new.user_id::text || new.dataset, 3));
    if exists (
        select 1 from public.preset_likes
        where preset_id = new.preset_id and user_id = new.user_id and dataset = new.dataset
    ) then return null; end if;
    select owner_id, dataset into author, source_dataset from public.presets
    where id = new.preset_id and is_public and dataset = 'A';
    if author is null then raise exception 'Preset not found or private'; end if;
    if author = auth.uid() and source_dataset = new.dataset then raise exception 'Cannot like your own preset'; end if;
    perform public.consume_user_rate_limit(auth.uid(), 'like', 60);
    update public.community_counters set value = value + 1 where name = 'likes' and value < 250000;
    if not found then raise exception 'Community like storage limit reached'; end if;
    return new;
end;
$$;

create or replace function public.save_community_preset(source_preset uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
    actor uuid := auth.uid();
    target_dataset text := public.workspace_dataset();
    source public.presets%rowtype;
    copy_id uuid;
begin
    if actor is null then raise exception 'Authentication required'; end if;
    select * into source from public.presets where id = source_preset and is_public and dataset = 'A';
    if not found then raise exception 'Public preset not found'; end if;
    if source.owner_id = actor and source.dataset = target_dataset then raise exception 'Cannot save your own preset'; end if;
    perform pg_advisory_xact_lock(hashtextextended(actor::text || target_dataset || source.id::text, 0));
    select saved_preset_id into copy_id from public.preset_saves
    where source_preset_id = source.id and user_id = actor and dataset = target_dataset;
    if found then return copy_id; end if;
    insert into public.presets (owner_id, dataset, name, description, preset_kind, schema_version, preset_data, source_preset_id)
    values (actor, target_dataset, left(source.name, 56) || ' (Copy)', source.description,
        source.preset_kind, source.schema_version, source.preset_data, source.id)
    returning id into copy_id;
    insert into public.preset_saves(source_preset_id, user_id, dataset, saved_preset_id)
    values (source.id, actor, target_dataset, copy_id);
    return copy_id;
end;
$$;
revoke all on function public.save_community_preset(uuid) from public, anon;

create or replace function public.record_preset_view(viewed_preset uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    target_dataset text := public.workspace_dataset();
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    delete from public.preset_views where viewed_on < current_date - 30;
    insert into public.preset_views(preset_id, user_id, dataset, viewed_on)
    select id, auth.uid(), target_dataset, current_date from public.presets
    where id = viewed_preset and is_public and dataset = 'A'
    on conflict do nothing;
    if found then
        update public.community_counters set value = value + 1 where name = 'views' and value < 250000;
        if found then
            perform set_config('mandelflight.counter_update', 'on', true);
            update public.presets set views = views + 1 where id = viewed_preset;
            perform set_config('mandelflight.counter_update', 'off', true);
        else
            perform set_config('mandelflight.view_discard', 'on', true);
            delete from public.preset_views where preset_id = viewed_preset and user_id = auth.uid()
                and dataset = target_dataset and viewed_on = current_date;
            perform set_config('mandelflight.view_discard', 'off', true);
        end if;
    end if;
end;
$$;
revoke all on function public.record_preset_view(uuid) from public, anon;

notify pgrst, 'reload schema';
commit;
