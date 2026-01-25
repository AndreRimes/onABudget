ALTER TABLE `user` ADD `password` text NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `image` text(255);--> statement-breakpoint
ALTER TABLE `user` ADD `email_verified` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `password_hash`;