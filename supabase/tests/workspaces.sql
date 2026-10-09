-- Run after 202610090004. All test writes, counters and role changes roll back.
begin;
select set_config('test.admin', (select id::text from public.profiles where is_admin limit 1), true);
select set_config('test.user', (select id::text from public.profiles where not is_admin limit 1), true);
select set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('test.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
    a uuid;
    private_a uuid;
    b uuid;
    copied uuid;
    actor uuid := auth.uid();
    rejected boolean;
    payload jsonb := '{"kind":"visual","schemaVersion":1,"geometry":{},"color":{},"post":{}}';
begin
    if actor is null or current_setting('test.user', true) is null then
        raise exception 'Tests require one admin and one non-admin profile';
    end if;
    perform set_config('request.headers', '{"x-mandelflight-mode":"user"}', true);
    if public.get_workspace_access() ->> 'dataset' <> 'A' then raise exception 'Wrong initial dataset'; end if;
    insert into public.presets (name, preset_data, is_public) values ('Workspace regression A', payload, true)
    returning id into a;
    insert into public.presets (name, preset_data) values ('Workspace regression private A', payload)
    returning id into private_a;
    rejected := false;
    begin
        perform public.set_preset_featured(a, true, 0);
    exception when raise_exception then rejected := true;
    end;
    if not rejected then raise exception 'User/A must reject admin RPC'; end if;
    rejected := false;
    begin
        perform public.set_landing_preset(payload);
    exception when raise_exception then rejected := true;
    end;
    if not rejected then raise exception 'User/A must reject landing RPC'; end if;

    perform set_config('request.headers', '{"x-mandelflight-mode":"admin"}', true);
    if not exists (select 1 from public.presets where id = a) then raise exception 'Admin/A lost A'; end if;
    perform public.set_preset_featured(a, true, 0);
    perform public.set_preset_featured(a, false, 0);

    perform set_config('request.headers', '{"x-mandelflight-mode":"test"}', true);
    insert into public.presets (name, dataset, preset_data) values ('Workspace regression B', 'B', payload)
    returning id into b;
    if exists (select 1 from public.presets where id = private_a) then
        raise exception 'B exposed private A';
    end if;
    rejected := false;
    begin
        update public.presets set is_public = true where id = b;
    exception when check_violation then rejected := true;
    end;
    if not rejected then raise exception 'B can publish'; end if;
    rejected := false;
    begin
        perform public.set_preset_featured(a, true, 0);
    exception when raise_exception then rejected := true;
    end;
    if not rejected then raise exception 'Test/B must reject admin RPC'; end if;
    insert into public.preset_likes(preset_id, user_id, dataset) values (a, actor, 'B');
    copied := public.save_community_preset(a);
    if not exists (select 1 from public.presets where id = copied and dataset = 'B' and not is_public) then
        raise exception 'Community copy went to wrong dataset';
    end if;
    if public.save_community_preset(a) <> copied then raise exception 'Duplicate community copy'; end if;
    perform public.record_preset_view(a);
    delete from public.preset_likes where preset_id = a and user_id = actor and dataset = 'B';

    perform set_config('request.headers', '{"x-mandelflight-mode":"user"}', true);
    if exists (select 1 from public.presets where id = b) then raise exception 'A exposed private B'; end if;
    update public.presets set name = 'Illegal cross-dataset update' where id = b;
    if found then raise exception 'A changed B'; end if;
    delete from public.presets where id = b;
    if found then raise exception 'A deleted B'; end if;

    perform set_config('request.headers', jsonb_build_object(
        'x-mandelflight-mode', 'user', 'x-mandelflight-user', current_setting('test.user'))::text, true);
    rejected := false;
    begin
        perform public.get_workspace_access();
    exception when raise_exception then rejected := true;
    end;
    if not rejected then raise exception 'Mismatched request identity accepted'; end if;

    perform set_config('request.jwt.claims', jsonb_build_object(
        'sub', current_setting('test.user'), 'role', 'authenticated')::text, true);
    perform set_config('request.headers', '{"x-mandelflight-mode":"test"}', true);
    rejected := false;
    begin
        perform public.get_workspace_access();
    exception when raise_exception then rejected := true;
    end;
    if not rejected then raise exception 'Non-admin obtained B'; end if;
    perform set_config('request.headers', '{"x-mandelflight-mode":"admin"}', true);
    rejected := false;
    begin
        perform public.set_preset_featured(a, true, 0);
    exception when raise_exception then rejected := true;
    end;
    if not rejected then raise exception 'Non-admin obtained administration'; end if;
end;
$$;
rollback;
select 'Workspace RLS and RPC tests passed; test writes rolled back.' as result;
