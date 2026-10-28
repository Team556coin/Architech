-- Hard limit: at most 5 server projects per user, even if two devices create one at the same moment.
CREATE OR REPLACE FUNCTION enforce_project_limit() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id));
  IF (SELECT count(*) FROM projects WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'project limit reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_limit ON projects;
--> statement-breakpoint
CREATE TRIGGER projects_limit BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION enforce_project_limit();
--> statement-breakpoint
ALTER TABLE profiles ADD CONSTRAINT profiles_credits_nonnegative CHECK (credits >= 0);
