-- Add current user to seeded channels (this will run for any authenticated user)
-- This ensures users can see and access the default channels

-- Create a function that adds users to default channels on their first login
create or replace function public.ensure_user_in_default_channels()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  general_channel_id uuid;
  demo_channel_id uuid;
begin
  -- Get the channel IDs for the default channels
  select id into general_channel_id from public.channels where name = 'general' and is_dm = false limit 1;
  select id into demo_channel_id from public.channels where name = 'mvp-demo' and is_dm = false limit 1;
  
  -- Add user to general channel if they're not already a member
  if general_channel_id is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (general_channel_id, auth.uid(), 'member')
    on conflict (channel_id, user_id) do nothing;
  end if;
  
  -- Add user to demo channel if they're not already a member  
  if demo_channel_id is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (demo_channel_id, auth.uid(), 'member')
    on conflict (channel_id, user_id) do nothing;
  end if;
end;
$$;

-- Update the handle_new_user function to include default channel membership
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer 
set search_path = public
as $$
begin
  -- Create user profile
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  
  -- Add user to default channels
  perform public.ensure_user_in_default_channels();
  
  return new;
end;
$$;