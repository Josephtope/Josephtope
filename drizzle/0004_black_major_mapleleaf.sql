CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`jobId` int,
	`eventType` varchar(80) NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `send_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`templateId` int NOT NULL,
	`connectionId` int,
	`idempotencyKey` varchar(190) NOT NULL,
	`mode` enum('dry_run','manual','live') NOT NULL,
	`status` enum('queued','approved','paused','blocked','sent','failed') NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` text,
	`providerMessageId` varchar(255),
	`approvedAt` timestamp,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `send_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `send_jobs_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `workspace_controls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`dryRun` int NOT NULL DEFAULT 1,
	`paused` int NOT NULL DEFAULT 0,
	`killSwitch` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_controls_id` PRIMARY KEY(`id`)
);
