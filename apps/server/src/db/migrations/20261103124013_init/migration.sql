CREATE TABLE `session_marks` (
	`last_viewed_at` integer,
	`session_id` text PRIMARY KEY,
	`settled_at` integer,
	`unsettled_at` integer
);
