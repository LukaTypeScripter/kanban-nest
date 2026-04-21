CREATE TABLE "kanban_board" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"owner_id" integer NOT NULL,
	"title" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_card" (
	"id" serial PRIMARY KEY NOT NULL,
	"column_id" integer,
	"title" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_column" (
	"id" serial PRIMARY KEY NOT NULL,
	"board_id" integer,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kanban_board" ADD CONSTRAINT "kanban_board_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_card" ADD CONSTRAINT "kanban_card_column_id_kanban_column_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_column"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_column" ADD CONSTRAINT "kanban_column_board_id_kanban_board_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."kanban_board"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_board_owner_title_idx" ON "kanban_board" USING btree ("owner_id","title");--> statement-breakpoint
CREATE INDEX "idx_boards_owner_id" ON "kanban_board" USING btree ("owner_id");