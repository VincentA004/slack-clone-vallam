-- Create an enum for user roles
create type public.app_role as enum ('admin', 'moderator', 'user');

-- Create user_roles table
create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role app_role not null,
    created_at timestamptz not null default now(),
    unique (user_id, role)
);

-- Enable RLS on user_roles
alter table public.user_roles enable row level security;

-- Create a security definer function to check if a user has a specific role
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Create a function to check if user is admin
create or replace function public.is_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin')
$$;

-- RLS policies for user_roles table
create policy "Users can view their own roles"
  on public.user_roles
  for select
  using (user_id = auth.uid());

create policy "Admins can view all roles"
  on public.user_roles
  for select
  using (public.is_admin());

create policy "Admins can insert roles"
  on public.user_roles
  for insert
  with check (public.is_admin());

create policy "Admins can update roles"
  on public.user_roles
  for update
  using (public.is_admin());

create policy "Admins can delete roles"
  on public.user_roles
  for delete
  using (public.is_admin());

-- Add allamvincent4@gmail.com as admin
insert into public.user_roles (user_id, role)
select id, 'admin'::app_role 
from auth.users 
where email = 'allamvincent4@gmail.com'
on conflict (user_id, role) do nothing;

-- Give default user role to existing users who don't have roles yet
insert into public.user_roles (user_id, role)
select u.id, 'user'::app_role
from auth.users u
left join public.user_roles ur on u.id = ur.user_id
where ur.user_id is null
on conflict (user_id, role) do nothing;