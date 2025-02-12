DO $$
BEGIN
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE tokens FROM %I', current_user);
END
$$;