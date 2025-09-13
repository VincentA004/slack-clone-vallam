-- Insert seed data for demo
INSERT INTO channels (name, is_private, is_dm) VALUES 
('general', false, false),
('mvp-demo', false, false)
ON CONFLICT DO NOTHING;