-- Update course credits default to 1 instead of 3
-- Version: 015
-- Description: Update default course credits for peer invitations from 3 to 1

-- Update the default value for course_credits column
ALTER TABLE authenticated_peer_invitations 
ALTER COLUMN course_credits SET DEFAULT 1;

-- Update any existing invitations that have the old default of 3 to 1
-- (Optional - only if you want to update existing invitations)
UPDATE authenticated_peer_invitations 
SET course_credits = 1 
WHERE course_credits = 3 
AND used = FALSE;

COMMENT ON COLUMN authenticated_peer_invitations.course_credits IS 'Course credits awarded to both inviter and invitee (default: 1)';