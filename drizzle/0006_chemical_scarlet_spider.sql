ALTER TABLE "kanban_card" DROP CONSTRAINT "kanban_card_column_id_kanban_column_id_fk";
--> statement-breakpoint
ALTER TABLE "kanban_column" DROP CONSTRAINT "kanban_column_board_id_kanban_board_id_fk";
--> statement-breakpoint
ALTER TABLE "kanban_card" ALTER COLUMN "column_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_column" ALTER COLUMN "board_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_card" ADD CONSTRAINT "kanban_card_column_id_kanban_column_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_column"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_column" ADD CONSTRAINT "kanban_column_board_id_kanban_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."kanban_board"("id") ON DELETE cascade ON UPDATE no action;