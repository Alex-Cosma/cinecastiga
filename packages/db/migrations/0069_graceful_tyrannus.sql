CREATE TABLE "app"."document_blob_chunks" (
	"hash" text NOT NULL,
	"part" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	CONSTRAINT "document_blob_chunks_hash_part_pk" PRIMARY KEY("hash","part"),
	CONSTRAINT "document_chunk_size" CHECK (octet_length("app"."document_blob_chunks"."bytes") between 1 and 1048576)
);
--> statement-breakpoint
ALTER TABLE "app"."document_blobs" ADD COLUMN "size" bigint;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "preparation" jsonb;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "contents" jsonb;--> statement-breakpoint
ALTER TABLE "app"."document_blob_chunks" ADD CONSTRAINT "document_blob_chunks_hash_document_blobs_hash_fk" FOREIGN KEY ("hash") REFERENCES "app"."document_blobs"("hash") ON DELETE cascade ON UPDATE no action;