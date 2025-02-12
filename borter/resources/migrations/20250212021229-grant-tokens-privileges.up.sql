DO $$
BEGIN
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE tokens TO %I', current_user);
END
$$;