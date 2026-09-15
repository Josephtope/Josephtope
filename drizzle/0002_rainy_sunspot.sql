CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`connectionId` int,
	`stableId` varchar(128) NOT NULL,
	`company` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`sourceName` varchar(160),
	`sourceUrl` varchar(1024),
	`batch` int,
	`status` enum('needs_review','verified','suppressed','sent','replied','failed') NOT NULL DEFAULT 'needs_review',
	`suppressionReason` varchar(255),
	`senderConnectionId` int,
	`sheetRow` int,
	`diagnostics` text,
	`version` int NOT NULL DEFAULT 1,
	`lastActivityAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`connectionId` int,
	`direction` enum('import','export','bidirectional') NOT NULL,
	`status` enum('queued','running','succeeded','failed','configuration_required') NOT NULL,
	`rowsRead` int NOT NULL DEFAULT 0,
	`rowsWritten` int NOT NULL DEFAULT 0,
	`duplicates` int NOT NULL DEFAULT 0,
	`failedRows` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_runs_id` PRIMARY KEY(`id`)
);
