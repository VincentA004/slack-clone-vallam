-- Fix the user creation trigger to pass user ID correctly
CREATE OR REPLACE FUNCTION public.ensure_user_in_default_channels(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    values (general_channel_id, _user_id, 'member')
    on conflict (channel_id, user_id) do nothing;
  end if;
  
  -- Add user to demo channel if they're not already a member  
  if demo_channel_id is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (demo_channel_id, _user_id, 'member')
    on conflict (channel_id, user_id) do nothing;
  end if;
end;
$function$;

-- Update the user creation trigger to pass the user ID
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Create user profile
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  
  -- Add user to default channels - pass the new user ID
  perform public.ensure_user_in_default_channels(new.id);
  
  return new;
end;
$function$;