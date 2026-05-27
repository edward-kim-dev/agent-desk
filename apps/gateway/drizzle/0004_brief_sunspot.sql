CREATE TABLE `work_package_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_package_id` integer NOT NULL,
	`step_index` integer NOT NULL,
	`file_path` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`last_seen_sha256` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`drift_detected` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`work_package_id`) REFERENCES `work_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_artifacts_wp_file_unique` ON `work_package_artifacts` (`work_package_id`,`file_path`);--> statement-breakpoint
CREATE TABLE `work_package_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_package_id` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`work_package_id`) REFERENCES `work_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`package_id` text NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`inputs_json` text NOT NULL,
	`baseline_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`advanced_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `briefed_at`;