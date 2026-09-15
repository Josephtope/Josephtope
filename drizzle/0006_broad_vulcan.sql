ALTER TABLE `google_connections` ADD `encryptedAccessToken` text;--> statement-breakpoint
ALTER TABLE `google_connections` ADD `encryptedRefreshToken` text;--> statement-breakpoint
ALTER TABLE `google_connections` ADD `tokenExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `google_connections` ADD `historyId` varchar(64);--> statement-breakpoint
ALTER TABLE `google_connections` ADD `watchExpiration` timestamp;