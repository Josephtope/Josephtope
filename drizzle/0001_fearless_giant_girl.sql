CREATE TABLE `google_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`googleSubject` varchar(128) NOT NULL,
	`email` varchar(320) NOT NULL,
	`displayName` varchar(160),
	`status` enum('active','reauthorization_required','revoked','disconnected') NOT NULL DEFAULT 'active',
	`grantedScopes` text,
	`spreadsheetId` varchar(128),
	`sheetTab` varchar(128) DEFAULT 'Sheet1',
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_connections_id` PRIMARY KEY(`id`)
);
