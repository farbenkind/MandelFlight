alter table public.presets
    drop constraint if exists presets_owner_id_profiles_fkey,
    drop constraint if exists presets_owner_id_fkey;

alter table public.presets
    add constraint presets_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete cascade;
