CREATE TABLE `conversation_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int NOT NULL,
	`gmailMessageId` varchar(255) NOT NULL,
	`gmailThreadId` varchar(255) NOT NULL,
	`sender` varchar(320),
	`recipients` text,
	`subject` varchar(998),
	`bodyPreview` text,
	`direction` enum('inbound','outbound') NOT NULL,
	`signal` enum('reply','bounce','out_of_office','unsubscribe','normal') NOT NULL DEFAULT 'normal',
	`receivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversation_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversation_messages_gmailMessageId_unique` UNIQUE(`gmailMessageId`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int,
	`connectionId` int,
	`gmailThreadId` varchar(255) NOT NULL,
	`subject` varchar(998),
	`lastMessageAt` timestamp,
	`lastHistoryId` varchar(64),
	`unreadCount` int NOT NULL DEFAULT 0,
	`stopReason` varchar(255),
	`state` enum('active','awaiting_reply','replied','bounced','out_of_office','unsubscribed','stopped') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversations_gmailThreadId_unique` UNIQUE(`gmailThreadId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`type` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`deepLink` varchar(500),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
