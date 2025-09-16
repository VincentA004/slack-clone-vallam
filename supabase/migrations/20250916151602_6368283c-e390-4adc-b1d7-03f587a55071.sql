-- Ensure the current user is added to the DM channel
INSERT INTO channel_members (channel_id, user_id, role)
VALUES ('7836603c-9d87-4c4a-86ec-1263080eb936', 'f815bbf7-853b-426a-b46d-bc9bd74f6cf4', 'member')
ON CONFLICT (channel_id, user_id) DO NOTHING;