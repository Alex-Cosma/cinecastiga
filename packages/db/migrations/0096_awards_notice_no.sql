-- The document collector finds every version of an award (the caNoticeIds SEAP published under one CAN number,
-- a republished or corrected award) to accept the documents its list returns for any of them (3 November 2026).
CREATE INDEX IF NOT EXISTS awards_notice_no_idx ON core.awards (notice_no) WHERE notice_no IS NOT NULL;
